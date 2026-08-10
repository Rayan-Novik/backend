import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

const ESTIMATIVAS_TAXAS = {
    MERCADOPAGO: { porcentagem: 4.99, fixo: 0.00 },
    STRIPE: { porcentagem: 3.99, fixo: 0.39 },
    ASAAS: { porcentagem: 1.99, fixo: 0.00 },
    ABACATEPAY: { porcentagem: 2.00, fixo: 0.00 },
    MERCADOLIVRE: { porcentagem: 16.00, fixo: 0.00 },
    MAQUININHA_CREDITO: { porcentagem: 4.50, fixo: 0.00 },
    MAQUININHA_DEBITO: { porcentagem: 1.99, fixo: 0.00 },  
    MAQUININHA_PIX: { porcentagem: 0.00, fixo: 0.00 },     
    DINHEIRO: { porcentagem: 0.00, fixo: 0.00 }            
};

export const registrarEntradaFinanceira = async ({
    id_pedido,
    id_usuario,
    gateway_provider,
    gateway_id,
    valor_bruto,
    valor_taxa_real = null,
    id_tenant
}) => {
    try {
        const bruto = Number(valor_bruto);
        let valorFinal = bruto;

        if (isNaN(valorFinal) || valorFinal === 0) {
            const pedidoBackup = await prisma.pedidos.findFirst({
                where: { id_pedido: Number(id_pedido), id_tenant },
                select: { preco_total: true }
            });
            if (pedidoBackup) valorFinal = Number(pedidoBackup.preco_total);
        }

        let taxa = 0;

        if (valor_taxa_real !== null && !isNaN(Number(valor_taxa_real))) {
            taxa = Number(valor_taxa_real);
        } else {
            const taxConfig = await prisma.SiteConfig.findUnique({
                where: { chave: 'GATEWAY_TAXES' }
            });

            const taxasCustomizadas = taxConfig ? taxConfig.valor : ESTIMATIVAS_TAXAS;
            const regra = taxasCustomizadas[gateway_provider] || { porcentagem: 0, fixo: 0 };
            taxa = (valorFinal * (Number(regra.porcentagem) / 100)) + Number(regra.fixo);
        }

        taxa = Math.round(taxa * 100) / 100;
        const liquido = Math.round((valorFinal - taxa) * 100) / 100;

        const transacao = await prisma.transacoes_financeiras.create({
            data: {
                id_pedido: Number(id_pedido),
                id_usuario: Number(id_usuario),
                id_tenant: id_tenant,
                gateway_provider: gateway_provider || 'DESCONHECIDO',
                gateway_id: String(gateway_id),
                tipo: 'ENTRADA',
                valor_bruto: valorFinal,
                valor_taxa: taxa,
                valor_liquido: liquido,
                data_criacao: new Date()
            }
        });

        console.log(`💰 [FINANCEIRO] ${gateway_provider} | Pedido #${id_pedido} | Bruto: ${valorFinal} | Taxa: ${taxa} | Líq: ${liquido}`);

        try {
            const contaReceber = await prisma.financeiro_contas_receber.findFirst({
                where: { id_pedido: Number(id_pedido), id_tenant: id_tenant }
            });

            if (contaReceber && contaReceber.status !== 'PAGO') {
                let formaPagamento = 'OUTRO';
                if (['MERCADOPAGO', 'STRIPE', 'ABACATEPAY', 'ASAAS', 'MAQUININHA_PIX'].includes(gateway_provider)) formaPagamento = 'PIX'; 
                if (['MAQUININHA_CREDITO', 'MAQUININHA_DEBITO'].includes(gateway_provider)) formaPagamento = 'CARTAO_CREDITO'; 

                const obsDetalhada = `Recebimento Auto via ${gateway_provider}. ID: ${gateway_id}. Bruto: R$${valorFinal.toFixed(2)} - Taxa: R$${taxa.toFixed(2)} = Líq: R$${liquido.toFixed(2)}`;

                await baixarContaReceber(contaReceber.id, {
                    valor: valorFinal,      
                    juros: 0,
                    multa: 0,
                    desconto: taxa, 
                    forma_pagamento: formaPagamento,
                    id_transacao: transacao.id_transacao,
                    observacao: obsDetalhada
                }, null, id_tenant);
                
                console.log(`✅ [ERP] Conta a Receber #${contaReceber.id} conciliada com sucesso.`);
            }
        } catch (baixaError) {
            console.warn(`⚠️ [ERP] Falha ao conciliar conta automática: ${baixaError.message}`);
        }

        return transacao;
    } catch (error) {
        console.error("❌ Erro CRÍTICO ao registrar financeiro:", error);
        return null; 
    }
};

export const criarContaPagar = async (dados, parcelas = 1, intervaloDias = 30, userId, id_tenant) => {
    const grupoUuid = uuidv4();
    const valorTotal = Number(dados.valor_total);
    const valorParcela = parseFloat((valorTotal / parcelas).toFixed(2));
    const valorUltimaParcela = parseFloat((valorTotal - (valorParcela * (parcelas - 1))).toFixed(2));

    const dataCompetencia = dados.data_competencia ? new Date(dados.data_competencia) : (dados.data_vencimento ? new Date(dados.data_vencimento) : new Date());

    const idFornecedor = dados.id_fornecedor && dados.id_fornecedor !== "" ? Number(dados.id_fornecedor) : null;
    const idCategoria = dados.id_categoria && dados.id_categoria !== "" ? Number(dados.id_categoria) : null;

    const contasCriadas = [];

    await prisma.$transaction(async (tx) => {
        for (let i = 0; i < parcelas; i++) {
            const isLast = i === (parcelas - 1);
            const valorAtual = isLast ? valorUltimaParcela : valorParcela;

            const vencimento = new Date(dados.data_vencimento);
            vencimento.setDate(vencimento.getDate() + (i * intervaloDias));

            const novaConta = await tx.financeiro_contas_pagar.create({
                data: {
                    id_tenant: id_tenant,
                    id_loja: dados.id_loja || null,
                    descricao: parcelas > 1 ? `${dados.descricao} (${i + 1}/${parcelas})` : dados.descricao,
                    valor_total: valorAtual,
                    valor_pago: 0,
                    saldo_restante: valorAtual,
                    data_competencia: dataCompetencia,
                    data_vencimento: vencimento,
                    status: 'PENDENTE',
                    id_fornecedor: idFornecedor,
                    id_categoria: idCategoria,
                    parcela_numero: i + 1,
                    parcela_total: parcelas,
                    grupo_uuid: grupoUuid,
                    criado_por: (!userId || isNaN(Number(userId)) || userId === 'DONO') ? null : Number(userId),
                    atualizado_em: new Date()
                }
            });
            contasCriadas.push(novaConta);
        }
    });

    return contasCriadas;
};

export const gerarRecebivelDePedido = async (pedido, id_tenant) => {
    try {
        // 1. Inteligência do ERP: Separa as categorias por canal de venda!
        const isPDV = pedido.canal_venda === 'PDV' || pedido.canal_venda === 'COMANDA';
        const nomeCategoria = isPDV ? 'Vendas PDV' : 'Vendas E-commerce';

        let categoria = await prisma.financeiro_categorias.findFirst({
            where: {
                nome: nomeCategoria,
                id_tenant: Number(id_tenant)
            }
        });

        if (!categoria) {
            categoria = await prisma.financeiro_categorias.create({
                data: {
                    nome: nomeCategoria,
                    tipo: 'RECEITA',
                    ativo: true, // 🟢 MÁGICA AQUI: Trocado de 1 para true!
                    id_tenant: Number(id_tenant)
                }
            });
        }

        const isPago = pedido.status_pagamento === 'PAGO';

        // 2. Cria a conta a receber usando a categoria dinâmica
        const recebivel = await prisma.financeiro_contas_receber.create({
            data: {
                descricao: `Venda #${pedido.id_pedido || pedido.id} (${nomeCategoria})`,
                valor_total: Number(pedido.preco_total),
                saldo_restante: isPago ? 0 : Number(pedido.preco_total),
                data_competencia: new Date(),
                data_vencimento: new Date(),
                data_liquidacao: isPago ? new Date() : null, // Mapeia a liquidação instantânea
                status: isPago ? 'PAGO' : 'PENDENTE',
                parcela_numero: 1,
                parcela_total: 1,
                id_usuario: pedido.id_usuario || null,
                id_categoria: categoria.id_categoria, 
                id_tenant: Number(id_tenant)
            }
        });

        return recebivel;
    } catch (error) {
        console.error("❌ Erro em gerarRecebivelDePedido:", error);
        throw error;
    }
};

export const baixarContaPagar = async (idConta, dadosBaixa, userId, id_tenant) => {
    return await prisma.$transaction(async (tx) => {
        const conta = await tx.financeiro_contas_pagar.findFirst({ 
            where: { id: Number(idConta), id_tenant: id_tenant } 
        });

        if (!conta) throw new Error('Conta a pagar não encontrada nesta loja.');
        if (conta.status === 'PAGO' || conta.status === 'CANCELADO') throw new Error('Conta já liquidada/cancelada.');

        const valorAmortizado = Number(dadosBaixa.valor);
        const juros = Number(dadosBaixa.juros || 0);
        const multa = Number(dadosBaixa.multa || 0);
        const desconto = Number(dadosBaixa.desconto || 0);
        const valorTotalMovimento = (valorAmortizado + juros + multa) - desconto;

        const novoValorPago = Number(conta.valor_pago) + valorAmortizado;
        const novoSaldo = Number(conta.valor_total) - novoValorPago;

        if (novoSaldo < -0.01) throw new Error(`Valor da baixa excede o saldo.`);

        let novoStatus = 'PARCIALMENTE_PAGO';
        let dataLiquidacao = null;
        if (Math.abs(novoSaldo) <= 0.01) {
            novoStatus = 'PAGO';
            dataLiquidacao = new Date();
        }

        const contaAtualizada = await tx.financeiro_contas_pagar.update({
            where: { id: conta.id },
            data: {
                valor_pago: novoValorPago,
                saldo_restante: novoSaldo <= 0.01 ? 0 : novoSaldo,
                status: novoStatus,
                data_liquidacao: dataLiquidacao,
                atualizado_em: new Date()
            }
        });

        const baixa = await tx.financeiro_baixas.create({
            data: {
                id_tenant: id_tenant,
                tipo: 'DESPESA',
                valor: valorAmortizado,
                juros, multa, desconto,
                valor_total_movimento: valorTotalMovimento,
                forma_pagamento: dadosBaixa.forma_pagamento,
                data_baixa: new Date(dadosBaixa.data_baixa || Date.now()),
                id_conta_pagar: conta.id,
                id_caixa_pdv: dadosBaixa.id_caixa_pdv ? Number(dadosBaixa.id_caixa_pdv) : null,
                observacao: dadosBaixa.observacao,
                criado_por: (!userId || isNaN(Number(userId)) || userId === 'DONO') ? null : Number(userId)
            }
        });

        if (dadosBaixa.id_caixa_pdv) {
            const caixa = await tx.caixa_pdv.findFirst({ 
                where: { id_caixa: Number(dadosBaixa.id_caixa_pdv), id_tenant: id_tenant } 
            });
            if (!caixa || caixa.status !== 'ABERTO') throw new Error('Caixa PDV fechado ou não encontrado.');

            await tx.movimentacao_caixa.create({
                data: {
                    id_tenant: id_tenant,
                    id_caixa: caixa.id_caixa,
                    tipo: 'SAIDA',
                    valor: valorTotalMovimento,
                    motivo: `Pagto Conta #${conta.id} - ${conta.descricao}`,
                    data_hora: new Date()
                }
            });

            await tx.caixa_pdv.update({
                where: { id_caixa: caixa.id_caixa },
                data: { saldo_sistema: { decrement: valorTotalMovimento } }
            });
        }

        return { conta: contaAtualizada, baixa };
    });
};

export const baixarContaReceber = async (idConta, dadosBaixa, userId, id_tenant) => {
    return await prisma.$transaction(async (tx) => {
        const conta = await tx.financeiro_contas_receber.findFirst({ 
            where: { id: Number(idConta), id_tenant: id_tenant } 
        });

        if (!conta) throw new Error('Conta não encontrada nesta loja.');
        if (conta.status === 'PAGO') throw new Error('Conta já recebida.');

        const valorAmortizado = Number(dadosBaixa.valor);
        const juros = Number(dadosBaixa.juros || 0);
        const multa = Number(dadosBaixa.multa || 0);
        const desconto = Number(dadosBaixa.desconto || 0); 
        
        const valorTotalMovimento = (valorAmortizado + juros + multa) - desconto;

        const novoValorRecebido = Number(conta.valor_recebido) + valorAmortizado;
        const novoSaldo = Number(conta.valor_total) - novoValorRecebido;

        let novoStatus = Math.abs(novoSaldo) <= 0.01 ? 'PAGO' : 'PARCIALMENTE_PAGO';
        let dataLiquidacao = novoStatus === 'PAGO' ? new Date() : null;

        const contaAtualizada = await tx.financeiro_contas_receber.update({
            where: { id: conta.id },
            data: {
                valor_recebido: novoValorRecebido,
                saldo_restante: novoSaldo <= 0.01 ? 0 : novoSaldo,
                status: novoStatus,
                data_liquidacao: dataLiquidacao,
                atualizado_em: new Date()
            }
        });

        const baixa = await tx.financeiro_baixas.create({
            data: {
                id_tenant: id_tenant,
                tipo: 'RECEITA',
                valor: valorAmortizado,
                juros, multa, desconto,
                valor_total_movimento: valorTotalMovimento,
                forma_pagamento: dadosBaixa.forma_pagamento,
                data_baixa: new Date(dadosBaixa.data_baixa || Date.now()),
                id_conta_receber: conta.id,
                id_transacao: dadosBaixa.id_transacao ? Number(dadosBaixa.id_transacao) : null,
                id_caixa_pdv: dadosBaixa.id_caixa_pdv ? Number(dadosBaixa.id_caixa_pdv) : null,
                observacao: dadosBaixa.observacao, 
                criado_por: (!userId || isNaN(Number(userId)) || userId === 'DONO') ? null : Number(userId)
            }
        });

        if (dadosBaixa.id_caixa_pdv) {
            const caixa = await tx.caixa_pdv.findFirst({ 
                where: { id_caixa: Number(dadosBaixa.id_caixa_pdv), id_tenant: id_tenant } 
            });
            if (!caixa || caixa.status !== 'ABERTO') throw new Error('Caixa fechado ou não encontrado.');

            await tx.movimentacao_caixa.create({
                data: {
                    id_tenant: id_tenant,
                    id_caixa: caixa.id_caixa,
                    tipo: 'ENTRADA',
                    valor: valorTotalMovimento,
                    motivo: `Receb. Conta #${conta.id}`,
                    data_hora: new Date()
                }
            });

            await tx.caixa_pdv.update({
                where: { id_caixa: caixa.id_caixa },
                data: { saldo_sistema: { increment: valorTotalMovimento } }
            });
        }

        return { conta: contaAtualizada, baixa };
    });
};

export const getDashboardFinanceiro = async (startDate, endDate, id_tenant) => {
    const inicio = new Date(startDate);
    const fim = new Date(endDate);

    const totalReceitas = await prisma.financeiro_baixas.aggregate({
        _sum: { valor_total_movimento: true },
        where: { tipo: 'RECEITA', data_baixa: { gte: inicio, lte: fim }, id_tenant: id_tenant }
    });

    const totalDespesas = await prisma.financeiro_baixas.aggregate({
        _sum: { valor_total_movimento: true },
        where: { tipo: 'DESPESA', data_baixa: { gte: inicio, lte: fim }, id_tenant: id_tenant }
    });

    const contasPagarAtrasadas = await prisma.financeiro_contas_pagar.aggregate({
        _sum: { saldo_restante: true },
        _count: { id: true },
        where: { id_tenant: id_tenant, status: { in: ['PENDENTE', 'PARCIALMENTE_PAGO'] }, data_vencimento: { lt: new Date() } }
    });

    const aReceberFuturo = await prisma.financeiro_contas_receber.aggregate({
        _sum: { saldo_restante: true },
        where: { id_tenant: id_tenant, status: { not: 'PAGO' }, data_vencimento: { gte: new Date() } }
    });

    const fluxoEntradas = await prisma.financeiro_baixas.groupBy({
        by: ['data_baixa'],
        where: { tipo: 'RECEITA', data_baixa: { gte: inicio, lte: fim }, id_tenant: id_tenant },
        _sum: { valor_total_movimento: true }
    });

    const fluxoSaidas = await prisma.financeiro_baixas.groupBy({
        by: ['data_baixa'],
        where: { tipo: 'DESPESA', data_baixa: { gte: inicio, lte: fim }, id_tenant: id_tenant },
        _sum: { valor_total_movimento: true }
    });

    return {
        resumo: {
            total_entradas: Number(totalReceitas._sum.valor_total_movimento || 0),
            total_saidas: Number(totalDespesas._sum.valor_total_movimento || 0),
            saldo_periodo: Number(totalReceitas._sum.valor_total_movimento || 0) - Number(totalDespesas._sum.valor_total_movimento || 0),
            divida_atrasada: Number(contasPagarAtrasadas._sum.saldo_restante || 0),
            a_receber_futuro: Number(aReceberFuturo._sum.saldo_restante || 0)
        },
        grafico: { entradas: fluxoEntradas, saidas: fluxoSaidas }
    };
};

export default {
    registrarEntradaFinanceira, criarContaPagar, baixarContaPagar,
    gerarRecebivelDePedido, baixarContaReceber, getDashboardFinanceiro
};