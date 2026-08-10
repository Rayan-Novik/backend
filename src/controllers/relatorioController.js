import { PrismaClient } from '@prisma/client';
import { format } from 'date-fns';

const prisma = new PrismaClient();

const getDateRange = (startDate, endDate) => {
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);
    return { start, end };
};

export const getSalesPerformanceReport = async (req, res, next) => {
    try {
        const { start, end } = getDateRange(req.query.startDate, req.query.endDate);
        const id_tenant = req.tenantId;
        
        const pedidos = await prisma.pedidos.findMany({
            where: { 
                data_pedido: { gte: start, lte: end }, 
                status_pagamento: 'PAGO',
                id_tenant: id_tenant
            },
            include: { pedido_items: true } 
        });

        const productIds = [...new Set(
            pedidos.flatMap(p => p.pedido_items.map(item => item.id_produto)).filter(id => id !== null)
        )];

        const productsWithCost = await prisma.produtos.findMany({
            where: { 
                id_produto: { in: productIds },
                id_tenant: id_tenant
            },
            select: { id_produto: true, custo: true }
        });

        const costMap = new Map(productsWithCost.map(p => [p.id_produto, parseFloat(p.custo || 0)]));

        const performanceByDay = {};
        pedidos.forEach(pedido => {
            const day = format(new Date(pedido.data_pedido), 'yyyy-MM-dd');
            if (!performanceByDay[day]) {
                performanceByDay[day] = { faturamento: 0, lucro: 0, pedidos: 0 };
            }

            const faturamentoPedido = parseFloat(pedido.preco_total);
            let custoPedido = 0;
            pedido.pedido_items.forEach(item => {
                custoPedido += (costMap.get(item.id_produto) || 0) * item.quantidade;
            });

            performanceByDay[day].faturamento += faturamentoPedido;
            performanceByDay[day].lucro += (faturamentoPedido - custoPedido);
            performanceByDay[day].pedidos += 1;
        });

        res.json(performanceByDay);
    } catch (error) { next(error); }
};

export const getTopSellingProductsReport = async (req, res, next) => {
    try {
        const { start, end } = getDateRange(req.query.startDate, req.query.endDate);
        const id_tenant = req.tenantId;

        const items = await prisma.pedido_items.findMany({
            where: { 
                pedidos: { 
                    data_pedido: { gte: start, lte: end },
                    id_tenant: id_tenant
                } 
            }
        });

        const productSales = {};
        items.forEach(item => {
            if (!productSales[item.nome]) {
                productSales[item.nome] = { quantidade: 0, faturamento: 0 };
            }
            productSales[item.nome].quantidade += item.quantidade;
            productSales[item.nome].faturamento += parseFloat(item.preco) * item.quantidade;
        });

        const salesArray = Object.entries(productSales).map(([nome, data]) => ({ nome, ...data }));
        const byQuantity = [...salesArray].sort((a, b) => b.quantidade - a.quantidade).slice(0, 10);
        const byRevenue = [...salesArray].sort((a, b) => b.faturamento - a.faturamento).slice(0, 10);
        
        res.json({ byQuantity, byRevenue });
    } catch (error) { next(error); }
};

export const getProductSalesReports = async (req, res, next) => {
    try {
        const items = await prisma.pedido_items.groupBy({
            by: ['id_produto', 'nome'],
            where: {
                pedidos: { id_tenant: req.tenantId }
            },
            _sum: { quantidade: true },
        });

        const sorted = items.sort((a, b) => b._sum.quantidade - a._sum.quantidade);
        
        res.json({
            bestSellers: sorted.slice(0, 5),
            worstSellers: sorted.slice(-5).reverse(),
        });
    } catch (error) { next(error); }
};

export const getMostViewedProducts = async (req, res, next) => {
    try {
        const viewed = await prisma.produtos.findMany({
            where: { id_tenant: req.tenantId },
            orderBy: { visualizacoes: 'desc' },
            take: 5,
        });
        res.json(viewed);
    } catch (error) { next(error); }
};

export const getCustomerFeedback = async (req, res, next) => {
    try {
        const feedback = await prisma.avaliacoes.findMany({
            where: { id_tenant: req.tenantId },
            orderBy: { data_avaliacao: 'desc' },
            take: 5,
            include: { produtos: true, usuarios: true },
        });
        res.json(feedback);
    } catch (error) { next(error); }
};

export const getSalesChartReport = async (req, res, next) => {
    try {
        const { start, end } = getDateRange(req.query.startDate, req.query.endDate);
        const id_tenant = req.tenantId;

        const pedidos = await prisma.pedidos.findMany({
            where: { 
                data_pedido: { gte: start, lte: end }, 
                status_pagamento: 'PAGO',
                id_tenant: id_tenant
            },
            include: { pedido_items: { include: { produtos: { select: { custo: true } } } } }
        });

        const performanceByDay = {};
        pedidos.forEach(pedido => {
            const day = format(new Date(pedido.data_pedido), 'yyyy-MM-dd');
            if (!performanceByDay[day]) {
                performanceByDay[day] = { faturamento: 0, lucro: 0 };
            }

            const faturamentoPedido = parseFloat(pedido.preco_total);
            let custoPedido = 0;
            pedido.pedido_items.forEach(item => {
                if(item.produtos && item.produtos.custo) {
                    custoPedido += parseFloat(item.produtos.custo) * item.quantidade;
                }
            });

            performanceByDay[day].faturamento += faturamentoPedido;
            performanceByDay[day].lucro += (faturamentoPedido - custoPedido);
        });
        
        const sortedLabels = Object.keys(performanceByDay).sort();
        const faturamentoData = sortedLabels.map(label => performanceByDay[label].faturamento);
        const lucroData = sortedLabels.map(label => performanceByDay[label].lucro);

        res.json({
            labels: sortedLabels.map(l => format(new Date(l), 'dd/MM/yy')),
            datasets: {
                faturamento: faturamentoData,
                lucro: lucroData
            }
        });

    } catch (error) { next(error); }
};

export const getProductPerformanceReport = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;

        const salesData = await prisma.pedido_items.groupBy({
            by: ['nome', 'id_produto'],
            where: {
                pedidos: { id_tenant: id_tenant }
            },
            _sum: { quantidade: true },
            orderBy: {
                _sum: { quantidade: 'desc' }
            }
        });

        const viewedData = await prisma.produtos.findMany({
            where: { 
                visualizacoes: { gt: 0 },
                id_tenant: id_tenant
            }, 
            orderBy: {
                visualizacoes: 'desc'
            }
        });
        
        res.json({
            mostSold: salesData.slice(0, 5),
            leastSold: salesData.slice(-5).reverse(),
            mostViewed: viewedData.slice(0, 5),
            leastViewed: viewedData.slice(-5).reverse(),
        });
    } catch (error) {
        next(error);
    }
};

export const getRelatorioCustos = async (req, res) => {
    try {
        const { data_inicio, data_fim } = req.query;
        const id_tenant = req.tenantId;

        const start = data_inicio ? new Date(data_inicio) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const end = data_fim ? new Date(data_fim) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

        const saidas = await prisma.movimentacaoEstoque.findMany({
            where: {
                tipo: 'SAIDA',
                data: { gte: start, lte: end },
                id_tenant: id_tenant
            },
            include: {
                produtos: {
                    select: {
                        nome: true,
                        tipo_produto: true,
                        preco_custo: true, 
                        unidade: true
                    }
                }
            }
        });

        let custoTotalVendas = 0;      
        let custoTotalProducao = 0;    
        let detalhes = [];

        for (const mov of saidas) {
            const custoMovimentacao = Number(mov.quantidade) * Number(mov.produtos.preco_custo || 0);
            
            const ehInsumoOuConsumo = mov.produtos.tipo_produto === 'INSUMO' || mov.motivo.includes('Consumo automático');

            if (ehInsumoOuConsumo) {
                custoTotalProducao += custoMovimentacao;
            } else {
                custoTotalVendas += custoMovimentacao;
            }

            detalhes.push({
                produto: mov.produtos.nome,
                tipo: mov.produtos.tipo_produto,
                quantidade: mov.quantidade,
                unidade: mov.produtos.unidade,
                custo_unitario: Number(mov.produtos.preco_custo),
                custo_total: custoMovimentacao,
                motivo: mov.motivo,
                data: mov.data
            });
        }

        res.json({
            periodo: { inicio: start, fim: end },
            resumo: {
                custo_insumos_fabricacao: custoTotalProducao, 
                custo_produtos_revenda: custoTotalVendas,     
                custo_total_periodo: custoTotalProducao + custoTotalVendas
            },
            detalhes: detalhes 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Erro ao gerar relatório de custos." });
    }
};

export const getPrevisaoCompra = async (req, res) => {
    try {
        const id_tenant = req.tenantId;
        const diasAnalise = 30; 
        const margemSeguranca = 1.10; 

        const dataLimite = new Date();
        dataLimite.setDate(dataLimite.getDate() - diasAnalise);

        const produtos = await prisma.produtos.findMany({
            where: { 
                ativo: true,
                id_tenant: id_tenant
            },
            select: {
                id_produto: true,
                nome: true,
                estoque: true,
                estoque_minimo: true,
                tipo_produto: true,
                unidade: true,
                preco_custo: true
            }
        });

        const relatorioPrevisao = [];

        for (const produto of produtos) {
            const consumo = await prisma.movimentacaoEstoque.aggregate({
                _sum: { quantidade: true },
                where: {
                    id_produto: produto.id_produto,
                    tipo: 'SAIDA',
                    data: { gte: dataLimite },
                    id_tenant: id_tenant
                }
            });

            const totalConsumido = Number(consumo._sum.quantidade || 0);
            const mediaMensal = totalConsumido; 

            const necessidadeBruta = (mediaMensal * margemSeguranca) - Number(produto.estoque);
            
            let sugestaoCompra = necessidadeBruta > 0 ? necessidadeBruta : 0;

            if (Number(produto.estoque) < Number(produto.estoque_minimo)) {
                const reporMinimo = Number(produto.estoque_minimo) - Number(produto.estoque);
                if (sugestaoCompra < reporMinimo) {
                    sugestaoCompra = reporMinimo;
                }
            }

            if (sugestaoCompra > 0 || totalConsumido > 0) {
                relatorioPrevisao.push({
                    id: produto.id_produto,
                    nome: produto.nome,
                    tipo: produto.tipo_produto,
                    estoque_atual: Number(produto.estoque),
                    consumo_ultimo_mes: totalConsumido,
                    sugestao_compra: Math.ceil(sugestaoCompra), 
                    unidade: produto.unidade,
                    custo_estimado_reposicao: Math.ceil(sugestaoCompra) * Number(produto.preco_custo || 0),
                    status: sugestaoCompra > 0 ? 'COMPRAR' : 'OK'
                });
            }
        }

        relatorioPrevisao.sort((a, b) => b.sugestao_compra - a.sugestao_compra);

        const custoTotalReposicao = relatorioPrevisao.reduce((acc, curr) => acc + curr.custo_estimado_reposicao, 0);

        res.json({
            analise_dias: diasAnalise,
            custo_total_previsao: custoTotalReposicao,
            itens: relatorioPrevisao
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Erro ao gerar previsão de compras." });
    }
};



export const getFaturamentoReport = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;
        const { startDate, endDate } = req.query;
        
        let dateFilter = {};
        if (startDate || endDate) {
            if (startDate) dateFilter.gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                dateFilter.lte = end;
            }
        }

        const pedidos = await prisma.pedidos.findMany({
            where: {
                id_tenant: id_tenant,
                status_pagamento: 'PAGO',
                ...(Object.keys(dateFilter).length > 0 && { data_pedido: dateFilter })
            },
            include: {
                usuarios: { select: { nome_completo: true } } // Pega o nome do cliente
            },
            orderBy: { data_pedido: 'desc' }
        });

        const relatorioMensal = {};
        const relatorioAnual = {};
        let totalGeral = 0;

        // Formata a lista detalhada para o Frontend
        const listaDetallhada = pedidos.map(p => {
            const valor = parseFloat(p.preco_total || 0);
            const data = new Date(p.data_pedido);
            
            // Agrupamento para os totais
            const mes = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
            const ano = `${data.getFullYear()}`;
            
            if (!relatorioMensal[mes]) relatorioMensal[mes] = 0;
            relatorioMensal[mes] += valor;
            if (!relatorioAnual[ano]) relatorioAnual[ano] = 0;
            relatorioAnual[ano] += valor;
            totalGeral += valor;

            return {
                id_pedido: p.id_pedido,
                data: p.data_pedido,
                cliente: p.usuarios?.nome_completo || 'Cliente não identificado',
                valor: valor,
                metodo: p.metodo_pagamento
            };
        });

        res.json({
            detalhes: listaDetallhada, // A lista de cada venda feita
            mensal: Object.keys(relatorioMensal).map(mes => ({ mes, faturamento: relatorioMensal[mes] })),
            anual: Object.keys(relatorioAnual).map(ano => ({ ano, faturamento: relatorioAnual[ano] })),
            total_geral: Number(totalGeral.toFixed(2))
        });
    } catch (error) { 
        next(error); 
    }
};

export const getRelatorioLucratividade = async (req, res, next) => {
    try {
        const id_tenant = req.tenantId;
        const { startDate, endDate } = req.query;
        
        // 🟢 Configuração de No-Cache para o Navegador
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');

        let dateFilter = {};
        
        // Se não enviar datas, o "Tempo Real" assume o dia de hoje
        const agora = new Date();
        
        if (startDate || endDate) {
            if (startDate) {
                dateFilter.gte = new Date(startDate);
            }
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999); // Garante que pega até o último milissegundo de hoje
                dateFilter.lte = end;
            }
        }

        // 1. Busca os Itens Vendidos
        // Filtramos estritamente por id_tenant e status PAGO
        const itensVendidos = await prisma.pedido_items.findMany({
            where: {
                pedidos: {
                    id_tenant: id_tenant,
                    status_pagamento: 'PAGO',
                    ...(Object.keys(dateFilter).length > 0 && { data_pedido: dateFilter })
                }
            },
            include: {
                pedidos: {
                    select: {
                        preco_itens: true,
                        preco_total: true,
                        data_pedido: true,
                        transacoes_financeiras: {
                            select: { valor_bruto: true, valor_taxa: true }
                        }
                    }
                }
            }
        });

        // 2. Busca os custos dos produtos (Query separada para performance e precisão)
        const productIds = [...new Set(itensVendidos.map(item => item.id_produto).filter(id => id !== null))];
        let produtosCustoMap = new Map();
        
        if (productIds.length > 0) {
            const produtosDb = await prisma.produtos.findMany({
                where: { id_produto: { in: productIds }, id_tenant: id_tenant },
                select: { id_produto: true, preco_custo: true }
            });
            produtosDb.forEach(p => produtosCustoMap.set(p.id_produto, p));
        }

        const relatorioMap = new Map();
        const totaisGerais = {
            quantidade: 0,
            faturamento_bruto: 0,
            faturamento_liquido: 0,
            reposicao: 0,
            taxas_gateway: 0,
            v_margem: 0
        };

        itensVendidos.forEach(item => {
            const idProd = item.id_produto;
            if (!idProd) return; 

            const nomeProd = item.nome;
            const qtd = Number(item.quantidade);
            const precoVenda = Number(item.preco);
            
            const infoProduto = produtosCustoMap.get(idProd);
            const ultimoCusto = infoProduto ? Number(infoProduto.preco_custo || 0) : 0;
            
            const faturamentoBruto = (precoVenda * qtd);
            
            let taxaGatewayRateada = 0;
            const pedido = item.pedidos;
            
            if (pedido && pedido.transacoes_financeiras && pedido.transacoes_financeiras.length > 0) {
                const transacao = pedido.transacoes_financeiras[0];
                const taxaTotalPedido = Number(transacao.valor_taxa || 0);
                const valorTotalPedido = Number(pedido.preco_total || 1);
                
                if (taxaTotalPedido > 0) {
                    const percentualParticipacao = faturamentoBruto / valorTotalPedido;
                    taxaGatewayRateada = taxaTotalPedido * percentualParticipacao;
                }
            }

            const faturamentoLiquido = faturamentoBruto - taxaGatewayRateada;
            const reposicao = qtd * ultimoCusto;
            const vMargem = faturamentoLiquido - reposicao;

            if (!relatorioMap.has(idProd)) {
                relatorioMap.set(idProd, {
                    id_produto: idProd,
                    nome: nomeProd,
                    quantidade: 0,
                    faturamento_bruto: 0,
                    faturamento_liquido: 0,
                    reposicao: 0,
                    taxas_gateway: 0,
                    v_margem: 0,
                });
            }

            const prod = relatorioMap.get(idProd);
            prod.quantidade += qtd;
            prod.faturamento_bruto += faturamentoBruto;
            prod.taxas_gateway += taxaGatewayRateada;
            prod.faturamento_liquido += faturamentoLiquido;
            prod.reposicao += reposicao;
            prod.v_margem += vMargem;

            totaisGerais.quantidade += qtd;
            totaisGerais.faturamento_bruto += faturamentoBruto;
            totaisGerais.taxas_gateway += taxaGatewayRateada;
            totaisGerais.faturamento_liquido += faturamentoLiquido;
            totaisGerais.reposicao += reposicao;
            totaisGerais.v_margem += vMargem;
        });

        const listaProdutos = Array.from(relatorioMap.values()).map(prod => {
            const margemPerc = prod.faturamento_liquido > 0 
                ? (prod.v_margem / prod.faturamento_liquido) * 100 : 0;
            return { ...prod, margem_perc: Number(margemPerc.toFixed(2)) };
        });

        totaisGerais.margem_perc = totaisGerais.faturamento_liquido > 0 
            ? (totaisGerais.v_margem / totaisGerais.faturamento_liquido) * 100 : 0;

        listaProdutos.sort((a, b) => b.v_margem - a.v_margem);

        res.json({ produtos: listaProdutos, totais: totaisGerais });

    } catch (error) {
        console.error("Erro ao gerar relatório de lucratividade:", error);
        res.status(500).json({ message: "Erro ao gerar relatório de lucratividade." });
    }
};