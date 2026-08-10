import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const processarNFAe = async (pedido, config, id_tenant) => {
    const numero_gerado = config.proximo_numero_nfae;
    const serie_gerada = config.serie_nfae;

    // NFA-e (Avulsa) tem regras estaduais específicas, mas a chave é similar
    const chaveAcessoFake = `NFAE-13-${config.cnpj}-${serie_gerada}-${numero_gerado}-${Date.now()}`;

    const notaSalva = await prisma.notas_fiscais.create({
        data: {
            id_tenant,
            id_pedido: pedido.id_pedido,
            tipo_nota: 'NFAE',
            numero_nota: numero_gerado,
            serie: serie_gerada,
            chave_acesso: chaveAcessoFake,
            valor_total: pedido.preco_total,
            status: 'RASCUNHO',
            motivo_status: 'Rascunho de Nota Avulsa gerado'
        }
    });

    await prisma.configuracoes_fiscais.update({
        where: { id_tenant },
        data: { proximo_numero_nfae: { increment: 1 } }
    });

    return notaSalva;
};