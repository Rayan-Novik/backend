import { PrismaClient } from '@prisma/client';
import { format } from 'date-fns';

// Cria a "ponte" de ligação com o banco de dados para este ficheiro
const prisma = new PrismaClient();

// Função auxiliar para validar e formatar datas
const getDateRange = (startDate, endDate) => {
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date();
    end.setHours(23, 59, 59, 999);
    return { start, end };
};

// --- NOVOS RELATÓRIOS AVANÇADOS (com filtros de data) ---

export const getSalesPerformanceReport = async (req, res, next) => {
    try {
        const { start, end } = getDateRange(req.query.startDate, req.query.endDate);
        
        // 1. Busca os pedidos com os seus itens
        const pedidos = await prisma.pedidos.findMany({
            where: { data_pedido: { gte: start, lte: end }, status_pagamento: 'PAGO' },
            include: { pedido_items: true } // Inclui os itens, mas não o produto (que causava o erro)
        });

        // 2. Coleciona todos os IDs de produtos únicos de todos os pedidos
        const productIds = [...new Set(
            pedidos.flatMap(p => p.pedido_items.map(item => item.id_produto)).filter(id => id !== null)
        )];

        // 3. Busca os custos para todos os produtos necessários numa única consulta
        const productsWithCost = await prisma.produtos.findMany({
            where: { id_produto: { in: productIds } },
            select: { id_produto: true, custo: true }
        });

        // 4. Cria um mapa para uma consulta rápida de custos
        const costMap = new Map(productsWithCost.map(p => [p.id_produto, parseFloat(p.custo || 0)]));

        // 5. Processa os dados, agregando por dia
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
        const items = await prisma.pedido_items.findMany({
            where: { pedidos: { data_pedido: { gte: start, lte: end } } }
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

// --- RELATÓRIOS SIMPLES (do seu código original, agora usando Prisma diretamente) ---

export const getProductSalesReports = async (req, res, next) => {
    try {
        const items = await prisma.pedido_items.groupBy({
            by: ['id_produto', 'nome'],
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
            orderBy: { visualizacoes: 'desc' },
            take: 5,
        });
        res.json(viewed);
    } catch (error) { next(error); }
};

export const getCustomerFeedback = async (req, res, next) => {
    try {
        const feedback = await prisma.avaliacoes.findMany({
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
        
        const pedidos = await prisma.pedidos.findMany({
            where: { data_pedido: { gte: start, lte: end }, status_pagamento: 'PAGO' },
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
        // 1. Busca os produtos mais e menos vendidos
        const salesData = await prisma.pedido_items.groupBy({
            by: ['nome', 'id_produto'],
            _sum: { quantidade: true },
            orderBy: {
                _sum: { quantidade: 'desc' }
            }
        });

        // 2. Busca os produtos mais e menos visualizados
        const viewedData = await prisma.produtos.findMany({
            where: { visualizacoes: { gt: 0 } }, // Ignora produtos nunca vistos
            orderBy: {
                visualizacoes: 'desc'
            }
        });
        
        res.json({
            // Pega os 5 primeiros da lista ordenada
            mostSold: salesData.slice(0, 5),
            // Pega os 5 últimos da lista e inverte para mostrar do menor para o maior
            leastSold: salesData.slice(-5).reverse(),
            // Pega os 5 primeiros da lista ordenada
            mostViewed: viewedData.slice(0, 5),
            // Pega os 5 últimos da lista e inverte
            leastViewed: viewedData.slice(-5).reverse(),
        });
    } catch (error) {
        next(error);
    }
};
