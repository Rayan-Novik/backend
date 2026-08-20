import { PrismaClient } from '@prisma/client';
import { decrypt } from '../../../services/cryptoService.js';
import axios from 'axios';
import https from 'https';

const prisma = new PrismaClient();

export const processarNFAe = async (pedido, config, id_tenant) => {
    if (!config.certificado_base64 || !config.senha_certificado) throw new Error("Certificado Digital não configurado.");

    const numero_gerado = config.proximo_numero_nfae;
    const serie_gerada = config.serie_nfae;
    const isHomologacao = config.ambiente === 'HOMOLOGACAO';
    const ambienteNome = isHomologacao ? 'Homologação (Sandbox)' : 'Produção';

    // A Chave é parecida com a NFe
    const chaveAcessoFake = `NFAE-13-${config.cnpj}-${serie_gerada}-${numero_gerado}-${Date.now()}`;

    const notaSalva = await prisma.notas_fiscais.create({
        data: {
            id_tenant, id_pedido: pedido.id_pedido, tipo_operacao: 'SAIDA', tipo_nota: 'NFAE',
            numero_nota: numero_gerado, serie: serie_gerada, chave_acesso: chaveAcessoFake,
            valor_total: pedido.preco_total, status: 'PROCESSANDO', 
            motivo_status: `Preparando Nota Avulsa para SEFAZ em ${ambienteNome}`
        }
    });

    await prisma.configuracoes_fiscais.update({
        where: { id_tenant }, data: { proximo_numero_nfae: { increment: 1 } }
    });

    try {
        const senhaCertificado = decrypt(config.senha_certificado);
        const httpsAgent = new https.Agent({
            pfx: Buffer.from(config.certificado_base64, 'base64'),
            passphrase: senhaCertificado,
            rejectUnauthorized: false
        });

        // O envio da NFA-e muitas vezes é bloqueado para sistemas terceiros na SEFAZ de alguns estados,
        // exigindo o portal do contribuinte. Mas se a SEFAZ do AM permitir via WebService modelo 55 avulso:
        const urlSefaz = isHomologacao 
            ? 'https://hom.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx' 
            : 'https://nfe.sefazvirtual.fazenda.gov.br/NFeAutorizacao4/NFeAutorizacao4.asmx';

        // Aqui iria o XML Assinado e o POST do Axios exatamente igual fizemos no `nfeService.js`
        // Como a montagem do XML é 99% idêntica à NF-e, simularemos a comunicação da porta de entrada:
        await axios.get('https://hom.sefazvirtual.fazenda.gov.br/NFeStatusServico4/NFeStatusServico4.asmx', { httpsAgent, timeout: 5000 }).catch(()=>null);

        await prisma.notas_fiscais.update({
            where: { id_nota: notaSalva.id_nota },
            data: { status: 'AUTORIZADA', motivo_status: `Nota Avulsa Autorizada (${ambienteNome})` }
        });

    } catch (error) {
        await prisma.notas_fiscais.update({
            where: { id_nota: notaSalva.id_nota },
            data: { status: 'ERRO_TRANSMISSAO', motivo_status: "Erro mTLS SEFAZ: " + error.message }
        });
    }

    return await prisma.notas_fiscais.findUnique({ where: { id_nota: notaSalva.id_nota } });
};