import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const processarNFAe = async (pedido, config, id_tenant) => {
    const numero_gerado = config.proximo_numero_nfae;
    const serie_gerada = config.serie_nfae;

    // 🟢 IDENTIFICA O AMBIENTE
    const isHomologacao = config.ambiente === 'HOMOLOGACAO';
    const ambienteNome = isHomologacao ? 'Homologação (Sandbox)' : 'Produção';

    // NFA-e (Avulsa) tem regras estaduais específicas, mas a chave é similar
    const chaveAcessoFake = `NFAE-13-${config.cnpj}-${serie_gerada}-${numero_gerado}-${Date.now()}`;

    // 1. Salva a NFAe no Banco
    const notaSalva = await prisma.notas_fiscais.create({
        data: {
            id_tenant,
            id_pedido: pedido.id_pedido,
            tipo_operacao: 'SAIDA',
            tipo_nota: 'NFAE',
            numero_nota: numero_gerado,
            serie: serie_gerada,
            chave_acesso: chaveAcessoFake,
            valor_total: pedido.preco_total,
            status: 'PROCESSANDO',
            motivo_status: `Preparando Nota Avulsa para SEFAZ em ${ambienteNome}`
        }
    });

    // 2. Incrementa contador
    await prisma.configuracoes_fiscais.update({
        where: { id_tenant },
        data: { proximo_numero_nfae: { increment: 1 } }
    });

    // ========================================================================
    // 🚀 TRANSMISSÃO DA NOTA AVULSA AQUI
    // ========================================================================
    try {
        // Simulação de transmissão:
        const sefazAprovou = true;

        if (sefazAprovou) {
            await prisma.notas_fiscais.update({
                where: { id_nota: notaSalva.id_nota },
                data: {
                    status: 'AUTORIZADA',
                    motivo_status: `Nota Avulsa Autorizada (${ambienteNome})`,
                    protocolo_sefaz: `NFAE-${Date.now()}`
                }
            });
        }
    } catch (error) {
        await prisma.notas_fiscais.update({
            where: { id_nota: notaSalva.id_nota },
            data: { status: 'ERRO_TRANSMISSAO', motivo_status: "Erro ao emitir Nota Avulsa" }
        });
    }

    return await prisma.notas_fiscais.findUnique({ where: { id_nota: notaSalva.id_nota } });
};