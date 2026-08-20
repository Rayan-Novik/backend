import { PrismaClient } from '@prisma/client';
import { decrypt } from '../../services/cryptoService.js';
import axios from 'axios';
import https from 'https';
import forge from 'node-forge';
import { SignedXml } from 'xml-crypto';
import { DOMParser } from '@xmldom/xmldom';

const prisma = new PrismaClient();

// ============================================================================
// 1. GERAR A CHAVE DE ACESSO DE 44 DÍGITOS DA SEFAZ
// ============================================================================
const gerarChaveAcesso = (uf, dataEmissao, cnpj, modelo, serie, numero, codigoAleatorio) => {
    const ano = String(dataEmissao.getFullYear() % 100).padStart(2, '0');
    const mes = String(dataEmissao.getMonth() + 1).padStart(2, '0');
    const cnpjFormatado = String(cnpj).padStart(14, '0');
    const chaveSemDV = `${uf}${ano}${mes}${cnpjFormatado}${modelo}${String(serie).padStart(3, '0')}${String(numero).padStart(9, '0')}1${String(codigoAleatorio).padStart(8, '0')}`;
    
    // Cálculo do Dígito Verificador (Módulo 11)
    let soma = 0; let peso = 2;
    for (let i = chaveSemDV.length - 1; i >= 0; i--) {
        soma += parseInt(chaveSemDV.charAt(i)) * peso;
        peso = peso === 9 ? 2 : peso + 1;
    }
    const resto = soma % 11;
    const dv = resto === 0 || resto === 1 ? 0 : 11 - resto;
    return `${chaveSemDV}${dv}`;
};

// ============================================================================
// 2. EXTRAIR CHAVES DO CERTIFICADO (.PFX para .PEM)
// ============================================================================
const extrairChavesDoCertificado = (pfxBase64, senha) => {
    const p12Der = forge.util.createBuffer(Buffer.from(pfxBase64, 'base64').toString('binary'));
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, senha);

    let privateKeyPem = '';
    let certPem = '';

    for (const safeContents of p12.safeContents) {
        for (const bag of safeContents.safeBags) {
            if (bag.type === forge.pki.oids.pkcs8ShroudedKeyBag) {
                const privateKey = bag.key;
                privateKeyPem = forge.pki.privateKeyToPem(privateKey);
            } else if (bag.type === forge.pki.oids.certBag) {
                const cert = bag.cert;
                certPem = forge.pki.certificateToPem(cert);
            }
        }
    }
    return { privateKeyPem, certPem };
};

// ============================================================================
// 3. ASSINAR O XML (XMLDSIG)
// ============================================================================
const assinarXml = (xml, chavePrivadaPem, certificadoPem, tagParaAssinar = 'infNFe') => {
    const sig = new SignedXml();
    sig.addReference(`//*[local-name(.)='${tagParaAssinar}']`, 
        ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"],
        "http://www.w3.org/2000/09/xmldsig#sha1"
    );
    sig.signingKey = chavePrivadaPem;
    sig.keyInfoProvider = {
        getKeyInfo: () => `<X509Data><X509Certificate>${certificadoPem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\r|\n/g, '')}</X509Certificate></X509Data>`
    };
    sig.computeSignature(xml);
    return sig.getSignedXml();
};

// ============================================================================
// 4. O SERVIÇO PRINCIPAL: TRANSMITIR PARA A SEFAZ
// ============================================================================
export const processarNFe = async (pedido, config, id_tenant, tipo_nota) => {
    // Validações Iniciais
    if (!config.certificado_base64 || !config.senha_certificado) {
        throw new Error("Certificado Digital não configurado.");
    }

    const isNfce = tipo_nota === 'NFCE';
    const numero_gerado = isNfce ? config.proximo_numero_nfce : config.proximo_numero_nfe;
    const serie_gerada = isNfce ? config.serie_nfce : config.serie_nfe;
    const modelo = isNfce ? '65' : '55';
    const tpAmb = config.ambiente === 'PRODUCAO' ? 1 : 2; 
    const cUF = '13'; // 13 = Amazonas
    const dataEmissao = new Date();
    const codigoAleatorio = Math.floor(10000000 + Math.random() * 89999999);
    
    const chaveAcessoReal = gerarChaveAcesso(cUF, dataEmissao, config.cnpj, modelo, serie_gerada, numero_gerado, codigoAleatorio);

    // Salva o Rascunho com a chave verdadeira
    const notaSalva = await prisma.notas_fiscais.create({
        data: {
            id_tenant, id_pedido: pedido.id_pedido, tipo_operacao: 'SAIDA', tipo_nota,
            numero_nota: numero_gerado, serie: serie_gerada, chave_acesso: chaveAcessoReal,
            valor_total: pedido.preco_total, status: 'PROCESSANDO', motivo_status: `Transmitindo para SEFAZ...`
        }
    });

    // Atualiza contadores
    await prisma.configuracoes_fiscais.update({
        where: { id_tenant },
        data: isNfce ? { proximo_numero_nfce: { increment: 1 } } : { proximo_numero_nfe: { increment: 1 } }
    });

    try {
        const senhaCertificado = decrypt(config.senha_certificado);
        const chaves = extrairChavesDoCertificado(config.certificado_base64, senhaCertificado);

        // ========================================================
        // MONTA A ESTRUTURA DO XML (NFC-e Básica)
        // ========================================================
        const dataIso = dataEmissao.toISOString().substring(0, 19) + '-04:00'; // Fuso de Manaus
        
        let xmlBase = `<?xml version="1.0" encoding="UTF-8"?>
<enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
    <idLote>1</idLote>
    <indSinc>1</indSinc>
    <NFe>
        <infNFe Id="NFe${chaveAcessoReal}" versao="4.00">
            <ide>
                <cUF>${cUF}</cUF>
                <cNF>${codigoAleatorio}</cNF>
                <natOp>VENDA</natOp>
                <mod>${modelo}</mod>
                <serie>${serie_gerada}</serie>
                <nNF>${numero_gerado}</nNF>
                <dhEmi>${dataIso}</dhEmi>
                <tpNF>1</tpNF>
                <idDest>1</idDest>
                <cMunFG>${config.codigo_municipio}</cMunFG>
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
                    <cMun>${config.codigo_municipio}</cMun>
                    <xMun>Manaus</xMun>
                    <UF>AM</UF>
                    <CEP>69000000</CEP>
                    <cPais>1058</cPais>
                    <xPais>BRASIL</xPais>
                </enderEmit>
                <IE>${config.inscricao_estadual}</IE>
                <CRT>${config.regime_tributario === 'SIMPLES_NACIONAL' ? '1' : '3'}</CRT>
            </emit>
            <dest>
                <CPF>00000000000</CPF>
                <xNome>NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL</xNome>
                <indIEDest>9</indIEDest>
            </dest>`;

            // ADICIONA OS ITENS DO PEDIDO
            pedido.pedido_items.forEach((item, index) => {
                const numItem = index + 1;
                xmlBase += `
            <det nItem="${numItem}">
                <prod>
                    <cProd>${item.id_produto}</cProd>
                    <cEAN>SEM GTIN</cEAN>
                    <xProd>${item.nome}</xProd>
                    <NCM>00000000</NCM>
                    <CFOP>5102</CFOP>
                    <uCom>UN</uCom>
                    <qCom>${Number(item.quantidade).toFixed(4)}</qCom>
                    <vUnCom>${Number(item.preco).toFixed(4)}</vUnCom>
                    <vProd>${(Number(item.quantidade) * Number(item.preco)).toFixed(2)}</vProd>
                    <cEANTrib>SEM GTIN</cEANTrib>
                    <uTrib>UN</uTrib>
                    <qTrib>${Number(item.quantidade).toFixed(4)}</qTrib>
                    <vUnTrib>${Number(item.preco).toFixed(4)}</vUnTrib>
                    <indTot>1</indTot>
                </prod>
                <imposto>
                    <ICMS>
                        <ICMSSN102>
                            <orig>0</orig>
                            <CSOSN>102</CSOSN>
                        </ICMSSN102>
                    </ICMS>
                    <PIS><PISOutr><CST>99</CST><vBC>0.00</vBC><pPIS>0.00</pPIS><vPIS>0.00</vPIS></PISOutr></PIS>
                    <COFINS><COFINSOutr><CST>99</CST><vBC>0.00</vBC><pCOFINS>0.00</pCOFINS><vCOFINS>0.00</vCOFINS></COFINSOutr></COFINS>
                </imposto>
            </det>`;
            });

        xmlBase += `
            <total>
                <ICMSTot>
                    <vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson>
                    <vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST>
                    <vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet>
                    <vProd>${Number(pedido.preco_total).toFixed(2)}</vProd>
                    <vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc>
                    <vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol>
                    <vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro>
                    <vNF>${Number(pedido.preco_total).toFixed(2)}</vNF>
                </ICMSTot>
            </total>
            <transp><modFrete>9</modFrete></transp>
            <pag><detPag><tPag>01</tPag><vPag>${Number(pedido.preco_total).toFixed(2)}</vPag></detPag></pag>
        </infNFe>
    </NFe>
</enviNFe>`;

        // ========================================================
        // ASSINA O XML COM O CERTIFICADO A1
        // ========================================================
        const xmlAssinado = assinarXml(xmlBase, chaves.privateKeyPem, chaves.certPem, 'infNFe');

        // MONTA O ENVELOPE SOAP EXIGIDO PELA SEFAZ
        const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
    <soap12:Header>
        <nfeCabecMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">
            <cUF>${cUF}</cUF>
            <versaoDados>4.00</versaoDados>
        </nfeCabecMsg>
    </soap12:Header>
    <soap12:Body>
        <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">
            ${xmlAssinado}
        </nfeDadosMsg>
    </soap12:Body>
</soap12:Envelope>`;

        // ========================================================
        // DISPARA O XML PARA A SEFAZ VIRTUAL (SVRS) - mTLS
        // ========================================================
        const httpsAgent = new https.Agent({
            pfx: Buffer.from(config.certificado_base64, 'base64'),
            passphrase: senhaCertificado,
            rejectUnauthorized: false
        });

        const urlSefaz = tpAmb === 1 
            ? 'https://nfe.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx' 
            : 'https://hom.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx';

        console.log(`🚀 Enviando XML Assinado para a SEFAZ... (${config.ambiente})`);

        const sefazResponse = await axios.post(urlSefaz, soapEnvelope, {
            headers: { 'Content-Type': 'application/soap+xml; charset=utf-8' },
            httpsAgent,
            timeout: 15000 // SEFAZ pode demorar
        });

        // ========================================================
        // LÊ O RETORNO DA SEFAZ
        // ========================================================
        const respostaSefazStr = sefazResponse.data;
        const cStatMatch = respostaSefazStr.match(/<cStat>(.*?)<\/cStat>/);
        const xMotivoMatch = respostaSefazStr.match(/<xMotivo>(.*?)<\/xMotivo>/);
        const nProtMatch = respostaSefazStr.match(/<nProt>(.*?)<\/nProt>/);
        
        const cStat = cStatMatch ? cStatMatch[1] : 'Desconhecido';
        const xMotivo = xMotivoMatch ? xMotivoMatch[1] : 'Sem motivo na resposta';
        const protocolo = nProtMatch ? nProtMatch[1] : null;

        await prisma.notas_fiscais.update({
            where: { id_nota: notaSalva.id_nota },
            data: {
                status: (cStat === '100' || cStat === '104') ? 'AUTORIZADA' : 'REJEITADA',
                motivo_status: `[${cStat}] ${xMotivo}`,
                protocolo_sefaz: protocolo,
                xml_gerado: xmlAssinado // Salvamos o XML real para você baixar depois
            }
        });

    } catch (error) {
        const erroMotivo = error.response ? error.response.data : error.message;
        console.error("❌ Erro ao enviar para SEFAZ:", erroMotivo);
        
        await prisma.notas_fiscais.update({
            where: { id_nota: notaSalva.id_nota },
            data: { status: 'ERRO_TRANSMISSAO', motivo_status: `Falha na SEFAZ: ${error.message}` }
        });
    }

    return await prisma.notas_fiscais.findUnique({ where: { id_nota: notaSalva.id_nota } });
};