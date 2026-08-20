import { PrismaClient } from '@prisma/client';
import { decrypt } from '../../../services/cryptoService.js';
import axios from 'axios';
import https from 'https';
import forge from 'node-forge';
import { SignedXml } from 'xml-crypto';

const prisma = new PrismaClient();

// ============================================================================
// FUNÇÕES AUXILIARES DE CRIPTOGRAFIA E ASSINATURA XML
// ============================================================================
const extrairChavesDoCertificado = (pfxBase64, senha) => {
    const b64Limpo = pfxBase64.replace(/^data:.*?;base64,/, '');
    
    const p12Der = forge.util.createBuffer(Buffer.from(b64Limpo, 'base64').toString('binary'));
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, senha);

    let privateKeyPem = '';
    let certPem = '';

    for (const safeContents of p12.safeContents) {
        for (const bag of safeContents.safeBags) {
            if (bag.key && !privateKeyPem) {
                privateKeyPem = forge.pki.privateKeyToPem(bag.key);
            }
            if (bag.cert && !certPem) {
                certPem = forge.pki.certificateToPem(bag.cert);
            }
        }
    }

    if (!privateKeyPem) throw new Error("Chave Privada não encontrada no arquivo .pfx.");
    if (!certPem) throw new Error("Certificado Público não encontrado no arquivo .pfx.");

    return { privateKeyPem, certPem };
};

const assinarXml = (xml, chavePrivadaPem, certificadoPem, tagParaAssinar = 'infNFe') => {
    const sig = new SignedXml();
    
    sig.signatureAlgorithm = "http://www.w3.org/2000/09/xmldsig#rsa-sha1";
    sig.canonicalizationAlgorithm = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315";
    
    sig.addReference({
        xpath: `//*[local-name(.)='${tagParaAssinar}']`,
        transforms: [
            "http://www.w3.org/2000/09/xmldsig#enveloped-signature", 
            "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"
        ],
        digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1"
    });

    sig.privateKey = Buffer.from(chavePrivadaPem);
    sig.signingKey = Buffer.from(chavePrivadaPem);
    
    sig.keyInfoProvider = {
        getKeyInfo: () => `<X509Data><X509Certificate>${certificadoPem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\r|\n/g, '')}</X509Certificate></X509Data>`
    };
    
    sig.computeSignature(xml);
    return sig.getSignedXml();
};

// ============================================================================
// GERAÇÃO DOS RASCUNHOS 
// ============================================================================
const processarNFe = async (pedido, config, id_tenant, tipo_nota) => {
    const isNfce = tipo_nota === 'NFCE';
    const numero_gerado = isNfce ? config.proximo_numero_nfce : config.proximo_numero_nfe;
    const serie_gerada = isNfce ? config.serie_nfce : config.serie_nfe;
    const modelo = isNfce ? '65' : '55';

    const cnpjFormatado = String(config.cnpj).padStart(14, '0');
    const cUF = '13'; // Amazonas
    const dataEmissao = new Date();
    const codigoAleatorio = Math.floor(10000000 + Math.random() * 89999999);

    const ano = String(dataEmissao.getFullYear() % 100).padStart(2, '0');
    const mes = String(dataEmissao.getMonth() + 1).padStart(2, '0');
    const chaveSemDV = `${cUF}${ano}${mes}${cnpjFormatado}${modelo}${String(serie_gerada).padStart(3, '0')}${String(numero_gerado).padStart(9, '0')}1${String(codigoAleatorio).padStart(8, '0')}`;
    
    let soma = 0; let peso = 2;
    for (let i = chaveSemDV.length - 1; i >= 0; i--) {
        soma += parseInt(chaveSemDV.charAt(i)) * peso;
        peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    const dv = resto === 0 || resto === 1 ? 0 : 11 - resto;
    const chaveAcessoReal = `${chaveSemDV}${dv}`;

    const notaSalva = await prisma.notas_fiscais.create({
        data: {
            id_tenant, id_pedido: pedido.id_pedido, tipo_operacao: 'SAIDA', tipo_nota,
            numero_nota: numero_gerado, serie: serie_gerada, chave_acesso: chaveAcessoReal,
            valor_total: pedido.preco_total, status: 'RASCUNHO', motivo_status: 'Rascunho SEFAZ gerado'
        }
    });

    await prisma.configuracoes_fiscais.update({
        where: { id_tenant },
        data: isNfce ? { proximo_numero_nfce: { increment: 1 } } : { proximo_numero_nfe: { increment: 1 } }
    });

    return notaSalva;
};

export const gerarNotaRascunho = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;
        const { id_pedido, tipo_nota } = req.body; 

        if (!id_pedido || !tipo_nota) return res.status(400).json({ message: "ID do pedido e tipo da nota obrigatórios." });

        const tipoUpperCase = tipo_nota.toUpperCase();
        const notaExistente = await prisma.notas_fiscais.findFirst({ where: { id_pedido: Number(id_pedido), id_tenant } });

        if (notaExistente) {
            return res.status(400).json({ message: `Este pedido já possui uma nota fiscal (${notaExistente.status}).` });
        }

        const pedido = await prisma.pedidos.findFirst({ where: { id_pedido: Number(id_pedido), id_tenant }, include: { pedido_items: true } });
        if (!pedido) return res.status(404).json({ message: "Pedido não encontrado." });

        const configFiscal = await prisma.configuracoes_fiscais.findUnique({ where: { id_tenant } });
        if (!configFiscal || !configFiscal.cnpj) return res.status(400).json({ message: "Configure o CNPJ do emissor." });

        let novaNota;
        if (tipoUpperCase === 'NFE' || tipoUpperCase === 'NFCE') novaNota = await processarNFe(pedido, configFiscal, id_tenant, tipoUpperCase);

        res.status(201).json({ message: `Rascunho gerado!`, nota: novaNota });
    } catch (error) {
        next(error);
    }
};

export const listarNotasSaida = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;
        const notas = await prisma.notas_fiscais.findMany({
            where: { id_tenant, tipo_operacao: 'SAIDA' },
            orderBy: { data_emissao: 'desc' },
            include: { pedidos: { include: { usuarios: true, enderecos: true, pedido_items: true } } }
        });
        res.status(200).json(notas);
    } catch (error) { next(error); }
};

// ============================================================================
// 🚀 EMITIR NOTA: O MOTOR REAL QUE CONSTRÓI, ASSINA E TRANSMITE O XML
// ============================================================================
export const emitirNota = async (req, res, next) => {
    const id_nota = Number(req.params.id);
    const id_tenant = req.tenantId;

    try {
        const nota = await prisma.notas_fiscais.findFirst({
            where: { id_nota, id_tenant },
            include: { pedidos: { include: { pedido_items: true, usuarios: true } } }
        });

        if (!nota) return res.status(404).json({ message: "Nota não encontrada." });
        if (nota.status === 'AUTORIZADA') return res.status(400).json({ message: "Nota já autorizada." });

        const config = await prisma.configuracoes_fiscais.findUnique({ where: { id_tenant } });
        if (!config || !config.certificado_base64 || !config.senha_certificado) {
            return res.status(400).json({ message: "Certificado não configurado." });
        }

        const tpAmb = config.ambiente === 'PRODUCAO' ? 1 : 2;
        const dataIso = new Date(nota.data_emissao).toISOString().substring(0, 19) + '-04:00';
        const codigoAleatorio = nota.chave_acesso.substring(35, 43);

        const inscricaoEstadual = config.inscricao_estadual && config.inscricao_estadual !== 'null' 
            ? config.inscricao_estadual 
            : 'ISENTO';

        // 🟢 BUSCANDO ABSOLUTAMENTE TUDO DO BANCO DE DADOS
        const idsProdutos = nota.pedidos.pedido_items.map(i => i.id_produto).filter(id => id != null);
        const produtosDB = await prisma.produtos.findMany({
            where: { id_produto: { in: idsProdutos } },
            select: { 
                id_produto: true, 
                ncm: true, 
                cfop_padrao: true, 
                cst_icms: true,
                cst_pis_cofins: true,
                origem: true,
                cest: true
            }
        });

        const dictProdutos = {};
        produtosDB.forEach(p => { dictProdutos[p.id_produto] = p; });

        // 1. CONSTRUÇÃO DO XML DA NOTA
        let xmlBase = `<enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
    <idLote>1</idLote>
    <indSinc>1</indSinc>
    <NFe>
        <infNFe Id="NFe${nota.chave_acesso}" versao="4.00">
            <ide>
                <cUF>13</cUF>
                <cNF>${codigoAleatorio}</cNF>
                <natOp>VENDA</natOp>
                <mod>${nota.tipo_nota === 'NFCE' ? '65' : '55'}</mod>
                <serie>${nota.serie}</serie>
                <nNF>${nota.numero_nota}</nNF>
                <dhEmi>${dataIso}</dhEmi>
                <tpNF>1</tpNF>
                <idDest>1</idDest>
                <cMunFG>${config.codigo_municipio || '1302603'}</cMunFG>
                <tpImp>4</tpImp>
                <tpEmis>1</tpEmis>
                <tpAmb>${tpAmb}</tpAmb>
                <finNFe>1</finNFe>
                <indFinal>1</indFinal>
                <indPres>1</indPres>
                <procEmi>0</procEmi>
                <verProc>1.0.0</verProc>
            </ide>
            <emit>
                <CNPJ>${config.cnpj}</CNPJ>
                <xNome>${config.razao_social}</xNome>
                <enderEmit>
                    <xLgr>Rua Teste</xLgr>
                    <nro>123</nro>
                    <xBairro>Centro</xBairro>
                    <cMun>${config.codigo_municipio || '1302603'}</cMun>
                    <xMun>Manaus</xMun>
                    <UF>AM</UF>
                    <CEP>69000000</CEP>
                    <cPais>1058</cPais>
                    <xPais>BRASIL</xPais>
                </enderEmit>
                <IE>${inscricaoEstadual}</IE>
                <CRT>${config.regime_tributario === 'SIMPLES_NACIONAL' ? '1' : '3'}</CRT>
            </emit>`;

        if (nota.pedidos.usuarios && nota.pedidos.usuarios.cpf_criptografado) {
            xmlBase += `
            <dest>
                <CPF>00000000000</CPF>
                <xNome>CONSUMIDOR FINAL</xNome>
                <indIEDest>9</indIEDest>
            </dest>`;
        } else {
            xmlBase += `<dest><CPF>00000000000</CPF><xNome>NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL</xNome><indIEDest>9</indIEDest></dest>`;
        }

        let somaProdutos = 0;

        // 🟢 INJETA TODOS OS DADOS FISCAIS REAIS NO XML
        nota.pedidos.pedido_items.forEach((item, idx) => {
            const valorItemTotal = Number(item.quantidade) * Number(item.preco);
            somaProdutos += valorItemTotal;

            const dadosProd = dictProdutos[item.id_produto] || {};
            
            // Tratamento das variáveis do banco (se vier vazio, joga o padrão de erro para o lojista arrumar)
            const ncmReal = dadosProd.ncm ? String(dadosProd.ncm).replace(/\D/g, '') : '00000000';
            const cfopReal = dadosProd.cfop_padrao ? String(dadosProd.cfop_padrao).replace(/\D/g, '') : '5102';
            const origemReal = dadosProd.origem ? String(dadosProd.origem) : '0';
            const csosnReal = dadosProd.cst_icms ? String(dadosProd.cst_icms).replace(/\D/g, '') : '102';
            const pisCofinsReal = dadosProd.cst_pis_cofins ? String(dadosProd.cst_pis_cofins).replace(/\D/g, '') : '07';
            
            // A tag CEST só entra no XML se ela existir no banco
            const cestXml = dadosProd.cest ? `<CEST>${String(dadosProd.cest).replace(/\D/g, '')}</CEST>` : '';

            xmlBase += `
            <det nItem="${idx + 1}">
                <prod>
                    <cProd>${item.id_produto}</cProd>
                    <cEAN>SEM GTIN</cEAN>
                    <xProd>${item.nome.substring(0, 120)}</xProd>
                    <NCM>${ncmReal}</NCM>
                    ${cestXml}
                    <CFOP>${cfopReal}</CFOP>
                    <uCom>UN</uCom>
                    <qCom>${Number(item.quantidade).toFixed(4)}</qCom>
                    <vUnCom>${Number(item.preco).toFixed(4)}</vUnCom>
                    <vProd>${valorItemTotal.toFixed(2)}</vProd>
                    <cEANTrib>SEM GTIN</cEANTrib>
                    <uTrib>UN</uTrib>
                    <qTrib>${Number(item.quantidade).toFixed(4)}</qTrib>
                    <vUnTrib>${Number(item.preco).toFixed(4)}</vUnTrib>
                    <indTot>1</indTot>
                </prod>
                <imposto>
                    <ICMS>
                        <ICMSSN${csosnReal}>
                            <orig>${origemReal}</orig>
                            <CSOSN>${csosnReal}</CSOSN>
                        </ICMSSN${csosnReal}>
                    </ICMS>
                    <PIS><PISNT><CST>${pisCofinsReal}</CST></PISNT></PIS>
                    <COFINS><COFINSNT><CST>${pisCofinsReal}</CST></COFINSNT></COFINS>
                </imposto>
            </det>`;
        });

        const valorFrete = Number(nota.valor_total) - somaProdutos;
        const freteFormatado = valorFrete > 0 ? valorFrete.toFixed(2) : "0.00";

        xmlBase += `
            <total>
                <ICMSTot>
                    <vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson>
                    <vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST>
                    <vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet>
                    <vProd>${somaProdutos.toFixed(2)}</vProd>
                    <vFrete>${freteFormatado}</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc>
                    <vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol>
                    <vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro>
                    <vNF>${Number(nota.valor_total).toFixed(2)}</vNF>
                </ICMSTot>
            </total>
            <transp><modFrete>9</modFrete></transp>
            <pag><detPag><tPag>01</tPag><vPag>${Number(nota.valor_total).toFixed(2)}</vPag></detPag></pag>
        </infNFe>
    </NFe>
</enviNFe>`;

        // 2. ASSINA COM O CERTIFICADO
        const senhaCertificado = decrypt(config.senha_certificado);
        const chaves = extrairChavesDoCertificado(config.certificado_base64, senhaCertificado);
        
        const regexInf = /<NFe>([\s\S]*?)<\/NFe>/;
        const xmlParaAssinar = xmlBase.match(regexInf)[1];
        const xmlAssinadoInterno = assinarXml(`<NFe xmlns="http://www.portalfiscal.inf.br/nfe">${xmlParaAssinar}</NFe>`, chaves.privateKeyPem, chaves.certPem, 'infNFe');
        
        const xmlFinalParaEnvio = xmlBase.replace(regexInf, xmlAssinadoInterno.replace(' xmlns="http://www.portalfiscal.inf.br/nfe"', ''));

        // 3. ENVELOPE SOAP
        const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
    <soap12:Header><nfeCabecMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4"><cUF>13</cUF><versaoDados>4.00</versaoDados></nfeCabecMsg></soap12:Header>
    <soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">${xmlFinalParaEnvio}</nfeDadosMsg></soap12:Body>
</soap12:Envelope>`;

        // 4. TRANSMISSÃO PARA A SEFAZ
        const httpsAgent = new https.Agent({
            pfx: Buffer.from(config.certificado_base64, 'base64'),
            passphrase: senhaCertificado,
            rejectUnauthorized: false
        });

        const urlSefaz = tpAmb === 1 
            ? 'https://nfe.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx' 
            : 'https://hom.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx';

        console.log(`🚀 Transmitindo Nota ${nota.chave_acesso} para a SEFAZ...`);

        const { data: respostaSefazStr } = await axios.post(urlSefaz, soapEnvelope, {
            headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
            httpsAgent, timeout: 15000
        });

        // 5. PROCESSA A RESPOSTA
        const cStatMatches = [...respostaSefazStr.matchAll(/<cStat>(.*?)<\/cStat>/g)];
        const xMotivoMatches = [...respostaSefazStr.matchAll(/<xMotivo>(.*?)<\/xMotivo>/g)];
        const nProtMatch = respostaSefazStr.match(/<nProt>(.*?)<\/nProt>/);
        
        const cStatReal = cStatMatches.length > 1 ? cStatMatches[cStatMatches.length - 1][1] : (cStatMatches[0] ? cStatMatches[0][1] : 'Desconhecido');
        const xMotivoReal = xMotivoMatches.length > 1 ? xMotivoMatches[xMotivoMatches.length - 1][1] : (xMotivoMatches[0] ? xMotivoMatches[0][1] : 'Sem motivo na resposta');
        const protocolo = nProtMatch ? nProtMatch[1] : null;

        if (cStatReal === '100') {
            const notaAtualizada = await prisma.notas_fiscais.update({
                where: { id_nota },
                data: {
                    status: 'AUTORIZADA',
                    motivo_status: `[${cStatReal}] ${xMotivoReal}`,
                    protocolo_sefaz: protocolo,
                    xml_gerado: xmlFinalParaEnvio
                }
            });
            return res.status(200).json({ message: "Autorizada!", nota: notaAtualizada });
        } else {
            await prisma.notas_fiscais.update({
                where: { id_nota },
                data: { status: 'REJEITADA', motivo_status: `[${cStatReal}] ${xMotivoReal}`, xml_gerado: xmlFinalParaEnvio }
            });
            return res.status(400).json({ message: `Rejeitada: ${xMotivoReal}` });
        }

    } catch (error) {
        console.error("Erro fatal na transmissão:", error.response?.data || error.message);
        
        await prisma.notas_fiscais.update({
            where: { id_nota }, 
            data: { status: 'ERRO_TRANSMISSAO', motivo_status: `Falha de Rede/Sefaz: ${error.message}` }
        });
        
        res.status(500).json({ message: "Erro ao conectar com a SEFAZ." });
    }
};