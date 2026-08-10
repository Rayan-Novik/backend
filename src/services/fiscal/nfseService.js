import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const processarNFSe = async (pedido, config, id_tenant) => {
    // Para serviços, usamos RPS (Recibo Provisório de Serviços)
    const numero_rps = config.proximo_numero_rps;
    const serie_rps = config.serie_rps;

    // A chave de acesso da NFS-e costuma ser gerada pela prefeitura após o envio, 
    // então no rascunho usamos um controle interno do RPS.
    const controleInterno = `RPS-${serie_rps}-${numero_rps}-${Date.now()}`;
    const xmlFake = `<EnviarLoteRpsEnvio><LoteRps><NumeroLote>1</NumeroLote><Rps><InfRps Id="${controleInterno}"></InfRps></Rps></LoteRps></EnviarLoteRpsEnvio>`;

    const notaSalva = await prisma.notas_fiscais.create({
        data: {
            id_tenant,
            id_pedido: pedido.id_pedido,
            tipo_nota: 'NFSE',
            numero_nota: numero_rps,
            // Guardamos a série provisória no campo chave_acesso apenas para controle do rascunho
            chave_acesso: controleInterno, 
            valor_total: pedido.preco_total,
            xml_gerado: xmlFake,
            status: 'RASCUNHO',
            motivo_status: 'RPS gerado, aguardando conversão em NFS-e na Prefeitura'
        }
    });

    // Incrementa o RPS na configuração
    await prisma.configuracoes_fiscais.update({
        where: { id_tenant },
        data: { proximo_numero_rps: { increment: 1 } }
    });

    return notaSalva;
};