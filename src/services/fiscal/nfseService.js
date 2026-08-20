import { PrismaClient } from '@prisma/client';
import { decrypt } from '../../../services/cryptoService.js';
import axios from 'axios';
import https from 'https';
import forge from 'node-forge';
import { SignedXml } from 'xml-crypto';

const prisma = new PrismaClient();

// Função para extrair chaves do PFX (Reaproveitada)
const extrairChavesDoCertificado = (pfxBase64, senha) => {
    const p12Der = forge.util.createBuffer(Buffer.from(pfxBase64, 'base64').toString('binary'));
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, senha);
    let privateKeyPem = '', certPem = '';
    for (const safeContents of p12.safeContents) {
        for (const bag of safeContents.safeBags) {
            if (bag.type === forge.pki.oids.pkcs8ShroudedKeyBag) privateKeyPem = forge.pki.privateKeyToPem(bag.key);
            else if (bag.type === forge.pki.oids.certBag) certPem = forge.pki.certificateToPem(bag.cert);
        }
    }
    return { privateKeyPem, certPem };
};

const assinarXml = (xml, chavePrivadaPem, certificadoPem, tagParaAssinar) => {
    const sig = new SignedXml();
    sig.addReference(`//*[local-name(.)='${tagParaAssinar}']`, 
        ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"],
        "http://www.w3.org/2000/09/xmldsig#sha1"
    );
    sig.signingKey = chavePrivadaPem;
    sig.keyInfoProvider = { getKeyInfo: () => `<X509Data><X509Certificate>${certificadoPem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\r|\n/g, '')}</X509Certificate></X509Data>` };
    sig.computeSignature(xml);
    return sig.getSignedXml();
};

export const processarNFSe = async (pedido, config, id_tenant) => {
    if (!config.certificado_base64 || !config.senha_certificado) throw new Error("Certificado Digital não configurado.");

    const numero_rps = config.proximo_numero_rps;
    const serie_rps = config.serie_rps;
    const isHomologacao = config.ambiente === 'HOMOLOGACAO';
    const ambienteNome = isHomologacao ? 'Homologação (Sandbox)' : 'Produção';
    const controleInterno = `RPS${serie_rps}${numero_rps}${Date.now()}`; // Sem traços para o XML
    
    const notaSalva = await prisma.notas_fiscais.create({
        data: {
            id_tenant, id_pedido: pedido.id_pedido, tipo_operacao: 'SAIDA', tipo_nota: 'NFSE',
            numero_nota: numero_rps, chave_acesso: controleInterno, valor_total: pedido.preco_total,
            status: 'PROCESSANDO', motivo_status: `Enviando NFS-e para a Prefeitura (${ambienteNome})`
        }
    });

    await prisma.configuracoes_fiscais.update({
        where: { id_tenant }, data: { proximo_numero_rps: { increment: 1 } }
    });

    try {
        const senhaCertificado = decrypt(config.senha_certificado);
        const chaves = extrairChavesDoCertificado(config.certificado_base64, senhaCertificado);

        // 1. MONTA O XML DO RPS (PADRÃO ABRASF - USADO EM MANAUS)
        let xmlBase = `<?xml version="1.0" encoding="UTF-8"?>
<EnviarLoteRpsEnvio xmlns="http://www.abrasf.org.br/nfse.xsd">
    <LoteRps Id="LOTE${numero_rps}">
        <NumeroLote>${numero_rps}</NumeroLote>
        <CpfCnpj><Cnpj>${config.cnpj}</Cnpj></CpfCnpj>
        <InscricaoMunicipal>${config.inscricao_municipal}</InscricaoMunicipal>
        <QuantidadeRps>1</QuantidadeRps>
        <ListaRps>
            <Rps>
                <InfRps Id="${controleInterno}">
                    <IdentificacaoRps>
                        <Numero>${numero_rps}</Numero>
                        <Serie>${serie_rps}</Serie>
                        <Tipo>1</Tipo>
                    </IdentificacaoRps>
                    <DataEmissao>${new Date().toISOString().substring(0, 19)}</DataEmissao>
                    <NaturezaOperacao>1</NaturezaOperacao>
                    <OptanteSimplesNacional>${config.regime_tributario === 'SIMPLES_NACIONAL' ? '1' : '2'}</OptanteSimplesNacional>
                    <IncentivadorCultural>2</IncentivadorCultural>
                    <Status>1</Status>
                    <Servico>
                        <Valores>
                            <ValorServicos>${Number(pedido.preco_total).toFixed(2)}</ValorServicos>
                            <ValorDeducoes>0.00</ValorDeducoes>
                            <ValorPis>0.00</ValorPis>
                            <ValorCofins>0.00</ValorCofins>
                            <ValorInss>0.00</ValorInss>
                            <ValorIr>0.00</ValorIr>
                            <ValorCsll>0.00</ValorCsll>
                            <IssRetido>2</IssRetido>
                            <ValorIss>0.00</ValorIss>
                            <Aliquota>0.00</Aliquota>
                            <DescontoIncondicionado>0.00</DescontoIncondicionado>
                            <DescontoCondicionado>0.00</DescontoCondicionado>
                        </Valores>
                        <ItemListaServico>01.01</ItemListaServico> <!-- Código do Serviço. Deve ser dinâmico no futuro -->
                        <CodigoTributacaoMunicipio>000000</CodigoTributacaoMunicipio>
                        <Discriminacao>Referente a prestacao de servicos conforme pedido ${pedido.id_pedido}</Discriminacao>
                        <CodigoMunicipio>${config.codigo_municipio}</CodigoMunicipio>
                    </Servico>
                    <Prestador>
                        <CpfCnpj><Cnpj>${config.cnpj}</Cnpj></CpfCnpj>
                        <InscricaoMunicipal>${config.inscricao_municipal}</InscricaoMunicipal>
                    </Prestador>
                    <Tomador>
                        <IdentificacaoTomador>
                            <CpfCnpj><Cpf>00000000000</Cpf></CpfCnpj>
                        </IdentificacaoTomador>
                        <RazaoSocial>Consumidor Final</RazaoSocial>
                    </Tomador>
                </InfRps>
            </Rps>
        </ListaRps>
    </LoteRps>
</EnviarLoteRpsEnvio>`;

        // ASSINA A TAG DO RPS E O LOTE (Exigência ABRASF)
        const xmlAssinadoRps = assinarXml(xmlBase, chaves.privateKeyPem, chaves.certPem, 'InfRps');
        const xmlAssinadoFinal = assinarXml(xmlAssinadoRps, chaves.privateKeyPem, chaves.certPem, 'LoteRps');

        // MONTA O ENVELOPE SOAP
        const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
        <RecepcionarLoteRps xmlns="http://nfse.abrasf.org.br">
            <xmlEnvio>${xmlAssinadoFinal}</xmlEnvio>
        </RecepcionarLoteRps>
    </soap:Body>
</soap:Envelope>`;

        const httpsAgent = new https.Agent({
            pfx: Buffer.from(config.certificado_base64, 'base64'),
            passphrase: senhaCertificado,
            rejectUnauthorized: false
        });

        // 🟢 URL DA PREFEITURA (Exemplo Manaus/NotaControl)
        const urlPrefeitura = isHomologacao 
            ? 'https://homologacao.notacontrol.com.br/abrasf/v1/recepcionarLoteRps' 
            : 'https://nfse.manaus.am.gov.br/abrasf/v1/recepcionarLoteRps';

        const prefeituraResponse = await axios.post(urlPrefeitura, soapEnvelope, {
            headers: { 'Content-Type': 'text/xml; charset=utf-8' },
            httpsAgent,
            timeout: 10000
        });

        // A Prefeitura geralmente devolve um Protocolo, e você tem que buscar a nota depois.
        await prisma.notas_fiscais.update({
            where: { id_nota: notaSalva.id_nota },
            data: {
                status: 'AUTORIZADA',
                motivo_status: `Lote Recepcionado pela Prefeitura (${ambienteNome})`,
                xml_gerado: xmlAssinadoFinal
            }
        });

    } catch (error) {
        console.error("Erro ao enviar NFS-e para a Prefeitura:", error.response?.data || error.message);
        await prisma.notas_fiscais.update({
            where: { id_nota: notaSalva.id_nota },
            data: { status: 'ERRO_TRANSMISSAO', motivo_status: `Erro Prefeitura: ${error.message}` }
        });
    }

    return await prisma.notas_fiscais.findUnique({ where: { id_nota: notaSalva.id_nota } });
};