import { PrismaClient } from '@prisma/client';
import { startOfToday, subDays, format, endOfDay, startOfDay, parseISO } from 'date-fns';
import { getValidAccessToken } from '../services/mercadoLivreService.js';
import axios from 'axios';

const prisma = new PrismaClient();

const getDatesFromQuery = (query) => {
    let { startDate, endDate } = query;

    // 🟢 CORREÇÃO: Força o uso estrito do StartOfDay e EndOfDay baseado na data local.
    // Isso evita o bug onde o dia "hoje" cai num fuso horário que o backend entende como ontem.
    if (!startDate || !endDate) {
        // Se não vier nada na query, o padrão absoluto passa a ser HOJE!
        const today = new Date();
        return {
            start: startOfDay(today),
            end: endOfDay(today)
        };
    } else {
        // Se o frontend enviar uma data, forçamos as 00:00:00 do startDate e 23:59:59 do endDate.
        // O `new Date(startDate + 'T00:00:00')` força a interpretação correta do dia.
        const parsedStart = startDate.includes('T') ? new Date(startDate) : new Date(startDate + 'T00:00:00');
        const parsedEnd = endDate.includes('T') ? new Date(endDate) : new Date(endDate + 'T00:00:00');
        
        return {
            start: startOfDay(parsedStart),
            end: endOfDay(parsedEnd)
        };
    }
};

export const getDashboardKPIs = async (req, res, next) => {
    try {
        const { start, end } = getDatesFromQuery(req.query);
        const tenantId = req.tenantId;

        const [
            dadosGerais, 
            dadosSite, 
            dadosML, 
            novosClientes, 
            estoqueBaixo, 
            estoqueNormal,
            financeiroReal
        ] = await Promise.all([
            prisma.pedidos.aggregate({
                _sum: { preco_total: true }, // 🟢 ADICIONADO: Agora somamos os pedidos reais!
                _count: { id_pedido: true },
                where: {
                    id_tenant: tenantId,
                    status_pagamento: 'PAGO',
                    data_pedido: { gte: start, lte: end }
                }
            }),
            prisma.pedidos.aggregate({
                _sum: { preco_total: true },
                _count: { id_pedido: true },
                where: {
                    id_tenant: tenantId,
                    status_pagamento: 'PAGO',
                    canal_venda: 'ecommerce',
                    data_pedido: { gte: start, lte: end }
                }
            }),
            prisma.pedidos.aggregate({
                _sum: { preco_total: true },
                _count: { id_pedido: true },
                where: {
                    id_tenant: tenantId,
                    status_pagamento: 'PAGO',
                    canal_venda: 'mercadolivre',
                    data_pedido: { gte: start, lte: end }
                }
            }),
            prisma.usuarios.count({
                where: { 
                    id_tenant: tenantId,
                    data_criacao: { gte: start, lte: end } 
                }
            }),
            prisma.produtos.count({
                where: { 
                    id_tenant: tenantId,
                    estoque: { lte: 10 }, 
                    active_ecommerce: true 
                }
            }),
            prisma.produtos.count({
                where: { 
                    id_tenant: tenantId,
                    estoque: { gt: 10 }, 
                    active_ecommerce: true 
                }
            }),
            // 🟢 MUDANÇA AQUI: Usamos a tabela financeira APENAS para somar as taxas!
            prisma.transacoes_financeiras.aggregate({
                _sum: { valor_taxa: true },
                where: {
                    id_tenant: tenantId,
                    data_criacao: { gte: start, lte: end }
                }
            })
        ]);

        const pedTotal = Number(dadosGerais._count?.id_pedido || 0);
        const pedSite = Number(dadosSite._count?.id_pedido || 0);
        const pedML = Number(dadosML._count?.id_pedido || 0);

        // 🟢 A FONTE DA VERDADE ABSOLUTA:
        const faturamentoReal = Number(dadosGerais._sum?.preco_total || 0);
        const taxasTotais = Number(financeiroReal._sum?.valor_taxa || 0);
        const liquidoReal = faturamentoReal - taxasTotais;

        const ticketMedio = pedTotal > 0 ? faturamentoReal / pedTotal : 0;

        res.json({
            faturamentoTotal: faturamentoReal,
            taxasTotais: taxasTotais,
            liquidoTotal: liquidoReal,
            pedidosTotais: pedTotal,
            ticketMedioTotal: ticketMedio,
            novosClientes: novosClientes,
            faturamentoEcommerce: Number(dadosSite._sum?.preco_total || 0),
            pedidosEcommerce: pedSite,
            faturamentoML: Number(dadosML._sum?.preco_total || 0),
            pedidosML: pedML,
            estoqueBaixo,
            estoqueNormal
        });

    } catch (error) {
        console.error("Erro Geral KPIs:", error);
        next(error);
    }
};

export const getChartData = async (req, res) => {
    try {
        const { start, end } = getDatesFromQuery(req.query);
        const tenantId = req.tenantId;

        const vendasRaw = await prisma.pedidos.findMany({
            where: {
                id_tenant: tenantId,
                data_pedido: { gte: start, lte: end },
                status_pagamento: 'PAGO'
            },
            select: { data_pedido: true, preco_total: true },
            orderBy: { data_pedido: 'asc' }
        });

        const vendasMap = {};
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dayStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            vendasMap[dayStr] = 0;
        }

        vendasRaw.forEach(venda => {
            const data = new Date(venda.data_pedido).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            if (vendasMap[data] !== undefined) {
                vendasMap[data] += Number(venda.preco_total);
            }
        });

        const salesChartData = Object.keys(vendasMap).map(key => ({
            name: key,
            total: vendasMap[key]
        }));

        const metodosRaw = await prisma.pedidos.groupBy({
            by: ['metodo_pagamento'],
            _count: { id_pedido: true },
            _sum: { preco_total: true },
            where: { 
                id_tenant: tenantId,
                status_pagamento: 'PAGO',
                data_pedido: { gte: start, lte: end }
            }
        });

        const paymentChartData = metodosRaw.map(item => ({
            name: item.metodo_pagamento || 'Outros',
            value: Number(item._sum.preco_total) 
        }));

        res.json({ salesChartData, paymentChartData });

    } catch (error) {
        console.error("Erro gráficos:", error);
        res.status(500).json({ error: 'Erro ao buscar dados gráficos' });
    }
};

export const getDetailedSalesChartData = async (req, res, next) => {
    try {
        const { start, end } = getDatesFromQuery(req.query);
        const tenantId = req.tenantId;

        const salesByDay = {};
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dayStr = format(d, 'yyyy-MM-dd');
            salesByDay[dayStr] = { ecommerce: 0, ml: 0 };
        }

        const ecommerceOrders = await prisma.pedidos.findMany({
            where: {
                id_tenant: tenantId,
                data_pedido: { gte: start, lte: end },
                status_pagamento: 'PAGO'
            },
            select: { data_pedido: true, preco_total: true }
        });

        ecommerceOrders.forEach(p => {
            const day = format(new Date(p.data_pedido), 'yyyy-MM-dd');
            if (salesByDay[day]) {
                salesByDay[day].ecommerce += Number(p.preco_total);
            }
        });

        try {
            const accessToken = await getValidAccessToken(tenantId);
            const { data: userData } = await axios.get('https://api.mercadolibre.com/users/me', { headers: { 'Authorization': `Bearer ${accessToken}` } });

            const { data: mlOrdersData } = await axios.get('https://api.mercadolibre.com/orders/search', {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                params: {
                    seller: userData.id,
                    "order.status": 'paid',
                    "order.date_created.from": start.toISOString(),
                    "order.date_created.to": end.toISOString(),
                    limit: 50 
                }
            });

            if (mlOrdersData.results) {
                mlOrdersData.results.forEach(order => {
                    const day = format(new Date(order.date_created), 'yyyy-MM-dd');
                    if (salesByDay[day]) {
                        salesByDay[day].ml += Number(order.total_amount);
                    }
                });
            }
        } catch (mlError) {
            console.error("Erro Gráfico ML (Ignorado):", mlError.message);
        }

        const sortedDays = Object.keys(salesByDay).sort();
        const ecommerceDataPoints = sortedDays.map(day => salesByDay[day].ecommerce);
        const mlDataPoints = sortedDays.map(day => salesByDay[day].ml);
        const finalLabels = sortedDays.map(day => format(new Date(day + 'T00:00:00'), 'dd/MM'));

        res.json({ labels: finalLabels, ecommerceData: ecommerceDataPoints, mlData: mlDataPoints });

    } catch (error) {
        next(error);
    }
};

export const getRecentConfirmedOrders = async (req, res, next) => {
    try {
        const { start, end } = getDatesFromQuery(req.query);
        const tenantId = req.tenantId;

        const ecommerceOrders = await prisma.pedidos.findMany({
            take: 10, 
            where: {
                id_tenant: tenantId,
                status_pagamento: 'PAGO',
                data_pedido: { gte: start, lte: end }
            },
            orderBy: { data_pedido: 'desc' },
            include: {
                usuarios: { select: { nome_completo: true } }
            }
        });

        const formattedEcommerceOrders = ecommerceOrders.map(order => ({
            id_pedido: order.id_pedido,
            nome_completo: order.usuarios?.nome_completo || 'Cliente',
            preco_total: Number(order.preco_total),
            data_pedido: order.data_pedido,
            origem: 'ecommerce',
            status_pagamento: order.status_pagamento
        }));

        let formattedMLOrders = [];

        const combinedOrders = [...formattedEcommerceOrders, ...formattedMLOrders]
            .sort((a, b) => new Date(b.data_pedido) - new Date(a.data_pedido))
            .slice(0, 10); 

        res.json(combinedOrders);
    } catch (error) {
        next(error);
    }
};

export const getTopSellingProducts = async (req, res, next) => {
    try {
        const { start, end } = getDatesFromQuery(req.query);
        const tenantId = req.tenantId;

        const pedidos = await prisma.pedidos.findMany({
            where: {
                id_tenant: tenantId,
                status_pagamento: 'PAGO',
                data_pedido: { gte: start, lte: end }
            },
            select: { id_pedido: true, data_pedido: true }
        });

        const pedidosIds = pedidos.map(p => p.id_pedido);

        const itensVendidos = await prisma.pedido_items.findMany({
            where: { 
                id_pedido: { in: pedidosIds },
                id_tenant: tenantId 
            }
        });

        const produtosIds = [...new Set(itensVendidos.map(i => i.id_produto))];

        const produtosInfo = await prisma.produtos.findMany({
            where: { 
                id_produto: { in: produtosIds },
                id_tenant: tenantId
            },
            include: { categorias: { select: { nome: true } } }
        });

        const mapaPedidos = {};
        pedidos.forEach(p => mapaPedidos[p.id_pedido] = p);

        const mapaProdutosInfo = {};
        produtosInfo.forEach(p => mapaProdutosInfo[p.id_produto] = p);

        const resultadoAgrupado = {};

        itensVendidos.forEach(item => {
            const idProd = item.id_produto;
            const produtoInfo = mapaProdutosInfo[idProd];
            const pedidoInfo = mapaPedidos[item.id_pedido];

            if (!produtoInfo || !pedidoInfo) return;

            if (!resultadoAgrupado[idProd]) {
                resultadoAgrupado[idProd] = {
                    id_produto: idProd,
                    nome: produtoInfo.nome,
                    imagem: produtoInfo.imagem_url || '',
                    categoria: produtoInfo.categorias?.nome || 'Geral',
                    preco_atual: Number(produtoInfo.preco),
                    estoque_atual: Number(produtoInfo.estoque), 
                    total_vendido: 0,
                    receita_gerada: 0,
                    historico_vendas: [],
                    pedidos_ids: []
                };
            }

            const precoVenda = Number(item.preco || 0);
            const qtd = Number(item.quantidade) || 1; 

            resultadoAgrupado[idProd].total_vendido += qtd; 
            resultadoAgrupado[idProd].receita_gerada += (precoVenda * qtd);

            resultadoAgrupado[idProd].historico_vendas.push({
                data: pedidoInfo.data_pedido,
                qtd: qtd,
                id_pedido: pedidoInfo.id_pedido
            });

            if (!resultadoAgrupado[idProd].pedidos_ids.includes(pedidoInfo.id_pedido)) {
                resultadoAgrupado[idProd].pedidos_ids.push(pedidoInfo.id_pedido);
            }
        });

        const topProducts = Object.values(resultadoAgrupado)
            .sort((a, b) => b.total_vendido - a.total_vendido)
            .slice(0, 10);

        const labels = topProducts.map(p => p.nome.length > 20 ? p.nome.substring(0, 20) + '...' : p.nome);
        const values = topProducts.map(p => p.total_vendido);
        const images = topProducts.map(p => p.imagem);

        res.json({ labels, values, images, fullData: topProducts });

    } catch (error) {
        console.error("Erro Top Produtos:", error);
        res.json({ labels: [], values: [], images: [], fullData: [] });
    }
};

export const getMostViewedProducts = async (req, res, next) => {
    try {
        const { start, end } = getDatesFromQuery(req.query);
        const tenantId = req.tenantId;

        const mostViewedGrouped = await prisma.produto_visualizacoes.groupBy({
            by: ['id_produto'],
            _sum: { quantidade: true },
            where: { 
                id_tenant: tenantId,
                data: { gte: start, lte: end } 
            },
            orderBy: { _sum: { quantidade: 'desc' } },
            take: 10
        });

        const productIds = mostViewedGrouped.map(item => item.id_produto);
        const productsDetails = await prisma.produtos.findMany({
            where: { 
                id_produto: { in: productIds },
                id_tenant: tenantId
            },
            include: { categorias: { select: { nome: true } } }
        });

        const productMap = {};
        productsDetails.forEach(p => productMap[p.id_produto] = p);

        const fullData = [];
        const labels = [];
        const values = [];
        const images = [];

        mostViewedGrouped.forEach(item => {
            const product = productMap[item.id_produto];
            const totalViews = Number(item._sum.quantidade || 0);

            if (product) {
                const shortName = product.nome.length > 20 ? product.nome.substring(0, 20) + '...' : product.nome;
                labels.push(shortName);
                values.push(totalViews);
                images.push(product.imagem_url || '');

                fullData.push({
                    ...product,
                    total_views: totalViews,
                    categoria_nome: product.categorias?.nome || 'Geral'
                });
            }
        });

        res.json({ labels, values, images, fullData });

    } catch (error) {
        console.error("Erro Mais Vistos:", error.message);
        res.json({ labels: [], values: [], images: [], fullData: [] });
    }
};

export const getInventoryStatus = async (req, res, next) => {
    try {
        const { start, end } = getDatesFromQuery(req.query);
        const tenantId = req.tenantId;

        const lowStock = await prisma.produtos.findMany({
            where: { 
                id_tenant: tenantId,
                estoque: { lte: 10 }, 
                active_ecommerce: true 
            },
            orderBy: [{ estoque: 'asc' }, { nome: 'asc' }],
            take: 15,
            include: { categorias: { select: { nome: true } } }
        });

        const highStock = await prisma.produtos.findMany({
            where: { 
                id_tenant: tenantId,
                estoque: { gte: 50 }, 
                active_ecommerce: true 
            },
            orderBy: { estoque: 'desc' },
            take: 10,
            include: { categorias: { select: { nome: true } } }
        });

        const itensVendidos = await prisma.pedido_items.findMany({
            where: {
                id_tenant: tenantId,
                pedidos: {
                    id_tenant: tenantId,
                    status_pagamento: 'PAGO',
                    data_pedido: { gte: start, lte: end }
                }
            }
        });

        const todosProdutos = await prisma.produtos.findMany({
            where: { id_tenant: tenantId },
            select: {
                id_produto: true, nome: true, imagem_url: true, preco_custo: true, preco: true, estoque: true,
                categorias: { select: { nome: true } }
            }
        });

        const mapaProdutosId = {};
        todosProdutos.forEach(p => {
            mapaProdutosId[p.id_produto] = {
                id: p.id_produto,
                nome: p.nome,
                imagem: p.imagem_url,
                categoria: p.categorias?.nome || 'Geral',
                preco_custo: p.preco_custo,
                preco: p.preco,
                estoque: p.estoque,
                preco_custo_atual: Number(p.preco_custo || 0), 
                qtd_vendida: 0,
                receita_total: 0,
                custo_total: 0
            };
        });

        itensVendidos.forEach(item => {
            const produto = mapaProdutosId[item.id_produto];
            if (produto) {
                const qtd = Number(item.quantidade) || 1; 
                const precoVenda = Number(item.preco || 0);
                
                const receita = precoVenda * qtd;
                const custo = produto.preco_custo_atual * qtd;

                produto.qtd_vendida += qtd; 
                produto.receita_total += receita;
                produto.custo_total += custo;
            }
        });

        const soldStock = Object.values(mapaProdutosId)
            .filter(p => p.qtd_vendida > 0)
            .map(p => ({
                ...p,
                lucro_realizado: p.receita_total - p.custo_total,
                margem_media: p.receita_total > 0
                    ? (((p.receita_total - p.custo_total) / p.receita_total) * 100).toFixed(1)
                    : 0
            }))
            .sort((a, b) => b.qtd_vendida - a.qtd_vendida)
            .slice(0, 10);

        const formatProductStock = (p) => {
            const custo = parseFloat(p.preco_custo || 0);
            const venda = parseFloat(p.preco || 0);
            const estoque = Number(p.estoque || 0); 
            const lucro = venda - custo;
            const margem = venda > 0 ? ((lucro / venda) * 100).toFixed(1) : 0;
            
            const potencialVenda = estoque > 0 
                ? estoque * venda 
                : 10 * venda;

            return {
                id: p.id || p.id_produto,
                nome: p.nome,
                imagem: p.imagem || p.imagem_url,
                categoria: p.categoria || (p.categorias?.nome || 'Geral'),
                estoque: estoque,
                preco_custo: custo,
                preco_venda: venda,
                lucro_unitario: lucro,
                margem_percentual: margem,
                capital_parado: estoque * custo,
                potencial_venda: potencialVenda 
            };
        };

        res.json({
            lowStock: lowStock.map(formatProductStock),
            highStock: highStock.map(formatProductStock),
            soldStock: soldStock
        });

    } catch (error) {
        console.error("Erro Estoque/Vendas:", error);
        res.status(200).json({ lowStock: [], highStock: [], soldStock: [] });
    }
};

export const getStockDetails = async (req, res, next) => {
    try {
        const { type } = req.query;
        const tenantId = req.tenantId;

        let whereCondition = { 
            active_ecommerce: true,
            id_tenant: tenantId 
        };
        let orderBy = {};

        if (type === 'low') {
            whereCondition.estoque = { lte: 10 };
            orderBy = [{ estoque: 'asc' }, { nome: 'asc' }];
        } else {
            whereCondition.estoque = { gt: 10 };
            orderBy = { estoque: 'desc' };
        }

        const products = await prisma.produtos.findMany({
            where: whereCondition,
            select: {
                id_produto: true, nome: true, imagem_url: true, 
                estoque: true, preco: true, preco_custo: true,
                categorias: { select: { nome: true } }
            },
            orderBy: orderBy,
            take: 50 
        });

        const formattedProducts = products.map(p => ({
            ...p,
            estoque: Number(p.estoque), 
            preco: Number(p.preco),
            preco_custo: Number(p.preco_custo),
            status: Number(p.estoque) === 0 ? 'ESGOTADO' : (Number(p.estoque) <= 5 ? 'CRÍTICO' : 'BAIXO'),
            valor_estoque_venda: Number(p.preco) * Number(p.estoque)
        }));

        res.json(formattedProducts);
    } catch (error) {
        console.error("Erro Stock Details:", error);
        res.status(500).json({ message: 'Erro ao buscar detalhes de estoque' });
    }
};

export const getReviewsSummary = async (req, res, next) => {
    try {
        const { start, end } = getDatesFromQuery(req.query);
        const tenantId = req.tenantId;

        const stats = await prisma.avaliacoes.aggregate({
            _avg: { nota: true },
            _count: { id_avaliacao: true },
            where: { 
                id_tenant: tenantId,
                data_avaliacao: { gte: start, lte: end } 
            }
        });

        const distribuicao = await prisma.avaliacoes.groupBy({
            by: ['nota'],
            _count: { nota: true },
            where: { 
                id_tenant: tenantId,
                data_avaliacao: { gte: start, lte: end } 
            }
        });

        const recentes = await prisma.avaliacoes.findMany({
            take: 8,
            where: { 
                id_tenant: tenantId,
                data_avaliacao: { gte: start, lte: end } 
            },
            orderBy: { data_avaliacao: 'desc' },
            include: {
                produtos: { select: { id_produto: true, nome: true, imagem_url: true } },
                usuarios: { select: { nome_completo: true, email: true } }
            }
        });

        const distFormatada = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        distribuicao.forEach(d => distFormatada[d.nota] = d._count.nota);

        res.json({
            mediaGeral: stats._avg.nota ? stats._avg.nota.toFixed(1) : "0.0",
            total: stats._count.id_avaliacao,
            distribuicao: distFormatada,
            recentes
        });
    } catch (error) {
        next(error);
    }
};

export const getProductAuditChartData = async (req, res, next) => {
    try {
        const { start, end } = getDatesFromQuery(req.query);
        const tenantId = req.tenantId;
        
        const logs = await prisma.AuditoriaProduto.findMany({
            where: { 
                id_tenant: tenantId,
                data_alteracao: { gte: start, lte: end } 
            },
            select: { data_alteracao: true, acao: true }
        });

        const grouped = {};
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dayStr = format(d, 'yyyy-MM-dd');
            grouped[dayStr] = { criacao: 0, edicao: 0 };
        }

        logs.forEach(log => {
            const day = format(new Date(log.data_alteracao), 'yyyy-MM-dd');
            if (grouped[day]) {
                const action = log.acao ? log.acao.toUpperCase() : 'OUTROS';
                if (action.includes('CRIA') || action === 'CREATE') {
                    grouped[day].criacao++;
                } else {
                    grouped[day].edicao++;
                }
            }
        });

        const sortedDays = Object.keys(grouped).sort();
        const labels = sortedDays.map(d => format(new Date(d + 'T00:00:00'), 'dd/MM'));
        const dataCriacao = sortedDays.map(d => grouped[d].criacao);
        const dataEdicao = sortedDays.map(d => grouped[d].edicao);

        res.json({ labels, dataCriacao, dataEdicao });
    } catch (error) {
        console.error("Erro Gráfico Auditoria:", error);
        res.json({ labels: [], dataCriacao: [], dataEdicao: [] });
    }
};

export const getSalesDetails = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const start = new Date(startDate);
        const end = new Date(endDate);

        // Busca apenas itens de pedidos que foram efetivamente PAGOS
        const itensVendidos = await prisma.pedido_items.findMany({
            where: {
                id_tenant: Number(req.tenantId),
                pedidos: {
                    status_pagamento: 'PAGO',
                    data_pedido: { gte: start, lte: end }
                }
            },
            include: {
                pedidos: { select: { data_pedido: true, id_pedido: true } }
            },
            orderBy: {
                pedidos: { data_pedido: 'desc' }
            }
        });

        // Formata os dados para o frontend mastigar direto
        const details = itensVendidos.map(item => ({
            id_pedido: item.pedidos.id_pedido,
            data: item.pedidos.data_pedido,
            produto: item.nome,
            quantidade: Number(item.quantidade),
            valor_unitario: Number(item.preco),
            // A quantidade vezes o preço unitário dá o valor total exato do produto
            total: Number(item.preco) * Number(item.quantidade)
        }));

        res.json(details);
    } catch (error) {
        console.error("Erro ao buscar detalhes de vendas:", error);
        res.status(500).json({ error: "Erro ao buscar extrato de vendas" });
    }
};