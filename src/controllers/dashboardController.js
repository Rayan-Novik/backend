import { PrismaClient } from '@prisma/client';
import { startOfToday, subDays, format, endOfDay, startOfDay } from 'date-fns';
import { getValidAccessToken } from '../services/mercadoLivreService.js';
import axios from 'axios';

const prisma = new PrismaClient();

// Função auxiliar para definir datas (se não vier da query, usa 30 dias)
const getDatesFromQuery = (query) => {
    let { startDate, endDate } = query;

    if (!startDate || !endDate) {
        // Padrão: Últimos 30 dias
        const end = new Date();
        const start = subDays(end, 30);
        startDate = start.toISOString();
        endDate = end.toISOString();
    } else {
        // Garante que o formato ISO inclua o horário para pegar o dia todo
        // startDate começa as 00:00, endDate termina as 23:59
        startDate = startOfDay(new Date(startDate)).toISOString();
        endDate = endOfDay(new Date(endDate)).toISOString();
    }

    return {
        start: new Date(startDate),
        end: new Date(endDate)
    };
};

// @desc      Obter todos os KPIs (Filtrado por Data)
// @route     GET /api/dashboard/kpis?startDate=...&endDate=...
// @access    Private/Admin
// @desc    KPIs principais do Dashboard (Correção de campos Usuario)
export const getDashboardKPIs = async (req, res, next) => {
    try {
        const { start, end } = getDatesFromQuery(req.query);
        console.log(`[KPIs] Buscando de ${start} até ${end}`);

        // 1. Dados Gerais (Faturamento e Pedidos Totais)
        const dadosGerais = await prisma.pedidos.aggregate({
            _sum: { preco_total: true },
            _count: { id_pedido: true },
            where: {
                status_pagamento: 'PAGO',
                data_pedido: { gte: start, lte: end }
            }
        });

        // 2. Novos Clientes (CORREÇÃO AQUI)
        const novosClientes = await prisma.usuarios.count({
            where: {
                // ❌ ANTES (ERRADO): data_cadastro, isAdmin
                // ✅ AGORA (CORRETO): data_criacao
                data_criacao: { gte: start, lte: end },
                
                // Se quiser filtrar admins, use o campo 'role' (ex: role: 'CLIENT')
                // Como não sei seus enums, vou deixar sem filtro de role para não quebrar
            }
        });

        // 3. Dados E-commerce
        const dadosSite = await prisma.pedidos.aggregate({
            _sum: { preco_total: true },
            _count: { id_pedido: true },
            where: {
                status_pagamento: 'PAGO',
                canal_venda: 'ecommerce',
                data_pedido: { gte: start, lte: end }
            }
        });

        // 4. Dados Mercado Livre
        const dadosML = await prisma.pedidos.aggregate({
            _sum: { preco_total: true },
            _count: { id_pedido: true },
            where: {
                status_pagamento: 'PAGO',
                canal_venda: 'mercadolivre',
                data_pedido: { gte: start, lte: end }
            }
        });

        // 5. Estoque (Sempre Atual)
        const estoqueBaixo = await prisma.produtos.count({
            where: { estoque: { lte: 10 }, active_ecommerce: true }
        });

        const estoqueNormal = await prisma.produtos.count({
            where: { estoque: { gt: 10 }, active_ecommerce: true }
        });

        // --- TRATAMENTO SEGURO ---
        const fatTotal = Number(dadosGerais._sum?.preco_total || 0);
        const pedTotal = Number(dadosGerais._count?.id_pedido || 0);

        const fatSite = Number(dadosSite._sum?.preco_total || 0);
        const pedSite = Number(dadosSite._count?.id_pedido || 0);

        const fatML = Number(dadosML._sum?.preco_total || 0);
        const pedML = Number(dadosML._count?.id_pedido || 0);

        const ticketMedio = pedTotal > 0 ? fatTotal / pedTotal : 0;

        res.json({
            faturamentoTotal: fatTotal,
            pedidosTotais: pedTotal,
            ticketMedioTotal: ticketMedio,
            novosClientes: novosClientes,
            
            faturamentoEcommerce: fatSite,
            pedidosEcommerce: pedSite,
            
            faturamentoML: fatML,
            pedidosML: pedML,

            estoqueBaixo,
            estoqueNormal
        });

    } catch (error) {
        console.error("Erro Geral KPIs:", error);
        next(error);
    }
};


// @desc    Obter dados do gráfico (Filtrado por Data)
// @route   GET /api/dashboard/detailed-sales-chart
// @access  Private/Admin
export const getDetailedSalesChartData = async (req, res, next) => {
    try {
        const { start, end } = getDatesFromQuery(req.query);

        // --- 1. Inicializa o mapa de dias ---
        // Cria um array com todos os dias no intervalo selecionado para o gráfico não ter buracos
        const salesByDay = {};
        const labels = [];

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dayStr = format(d, 'yyyy-MM-dd');
            labels.push(format(d, 'dd/MM'));
            salesByDay[dayStr] = { ecommerce: 0, ml: 0 };
        }

        // --- 2. Busca E-commerce ---
        const ecommerceOrders = await prisma.pedidos.findMany({
            where: {
                data_pedido: { gte: start, lte: end },
                status_pagamento: 'PAGO'
            },
            select: { data_pedido: true, preco_total: true }
        });

        ecommerceOrders.forEach(p => {
            const day = format(new Date(p.data_pedido), 'yyyy-MM-dd');
            if (salesByDay[day]) {
                salesByDay[day].ecommerce += parseFloat(p.preco_total);
            }
        });

        // --- 3. Busca Mercado Livre ---
        try {
            const accessToken = await getValidAccessToken();
            const { data: userData } = await axios.get('https://api.mercadolibre.com/users/me', { headers: { 'Authorization': `Bearer ${accessToken}` } });

            const { data: mlOrdersData } = await axios.get('https://api.mercadolibre.com/orders/search', {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                params: {
                    seller: userData.id,
                    "order.status": 'paid',
                    "order.date_created.from": start.toISOString(),
                    "order.date_created.to": end.toISOString(),
                    limit: 50 // Limite para o gráfico não ficar muito pesado
                }
            });

            if (mlOrdersData.results) {
                mlOrdersData.results.forEach(order => {
                    const day = format(new Date(order.date_created), 'yyyy-MM-dd');
                    if (salesByDay[day]) {
                        salesByDay[day].ml += order.total_amount;
                    }
                });
            }
        } catch (mlError) {
            console.error("Erro Gráfico ML:", mlError.message);
        }

        // --- 4. Formata para o Frontend ---
        // Garante a ordem cronológica
        const sortedDays = Object.keys(salesByDay).sort();

        // Se o intervalo for muito grande, o loop inicial garante que sortedDays tenha todos os dias
        const ecommerceDataPoints = sortedDays.map(day => salesByDay[day].ecommerce);
        const mlDataPoints = sortedDays.map(day => salesByDay[day].ml);

        // As labels precisam bater com os dados ordenados
        const finalLabels = sortedDays.map(day => format(new Date(day + 'T00:00:00'), 'dd/MM'));

        res.json({
            labels: finalLabels,
            ecommerceData: ecommerceDataPoints,
            mlData: mlDataPoints
        });

    } catch (error) {
        next(error);
    }
};

// @desc    Obter últimos pedidos (Filtrado por Data)
// @route   GET /api/dashboard/recent-confirmed-orders
// @access  Private/Admin
export const getRecentConfirmedOrders = async (req, res, next) => {
    try {
        const { start, end } = getDatesFromQuery(req.query);

        // --- 1. E-commerce ---
        const ecommerceOrders = await prisma.pedidos.findMany({
            take: 10, // Limite aumentado para garantir que apareçam
            where: {
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
            preco_total: order.preco_total,
            data_pedido: order.data_pedido,
            origem: 'ecommerce',
            status_pagamento: order.status_pagamento
        }));

        // --- 2. Mercado Livre ---
        let formattedMLOrders = [];
        try {
            const accessToken = await getValidAccessToken();
            const { data: userData } = await axios.get('https://api.mercadolibre.com/users/me', { headers: { 'Authorization': `Bearer ${accessToken}` } });

            const { data: mlOrdersData } = await axios.get('https://api.mercadolibre.com/orders/search', {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                params: {
                    seller: userData.id,
                    "order.status": 'paid',
                    "order.date_created.from": start.toISOString(),
                    "order.date_created.to": end.toISOString(),
                    sort: 'date_desc',
                    limit: 10
                }
            });

            if (mlOrdersData.results) {
                formattedMLOrders = mlOrdersData.results.map(order => ({
                    id_pedido: order.id,
                    nome_completo: order.buyer.nickname || 'Cliente ML',
                    preco_total: order.total_amount,
                    data_pedido: order.date_created,
                    origem: 'mercadolivre',
                    status_pagamento: 'approved' // ML Paid = Approved
                }));
            }
        } catch (mlError) {
            console.error("Erro Pedidos Recentes ML:", mlError.message);
        }

        // --- 3. Combina e Ordena ---
        const combinedOrders = [...formattedEcommerceOrders, ...formattedMLOrders]
            .sort((a, b) => new Date(b.data_pedido) - new Date(a.data_pedido))
            .slice(0, 10); // Retorna os 10 mais recentes do mix

        res.json(combinedOrders);

    } catch (error) {
        next(error);
    }
};

// @desc    Obter produtos mais vendidos (Top 5)
// @route   GET /api/dashboard/top-products
// @access  Private/Admin
export const getTopSellingProducts = async (req, res, next) => {
    try {
        const { start, end } = getDatesFromQuery(req.query);

        // --- 1. Busca os Pedidos PAGOS no período ---
        const pedidos = await prisma.pedidos.findMany({
            where: {
                status_pagamento: 'PAGO',
                data_pedido: { gte: start, lte: end }
            },
            select: {
                id_pedido: true,
                data_pedido: true
            }
        });

        // Extrai os IDs dos pedidos para buscar os itens
        const pedidosIds = pedidos.map(p => p.id_pedido);

        // --- 2. Busca os Itens desses pedidos ---
        const itensVendidos = await prisma.pedido_items.findMany({
            where: {
                id_pedido: { in: pedidosIds }
            }
            // Não usamos 'select' restritivo para evitar erro de campo desconhecido. 
            // O Prisma trará 'preco', 'quantidade', 'id_produto', etc.
        });

        // Extrai os IDs dos produtos para buscar nomes/imagens
        const produtosIds = [...new Set(itensVendidos.map(i => i.id_produto))];

        // --- 3. Busca detalhes dos Produtos ---
        const produtosInfo = await prisma.produtos.findMany({
            where: {
                id_produto: { in: produtosIds }
            },
            include: {
                categorias: { select: { nome: true } }
            }
        });

        // --- 4. Cruzamento de Dados (Manual e Seguro) ---
        
        // Mapas para acesso rápido
        const mapaPedidos = {};
        pedidos.forEach(p => mapaPedidos[p.id_pedido] = p);

        const mapaProdutosInfo = {};
        produtosInfo.forEach(p => mapaProdutosInfo[p.id_produto] = p);

        const resultadoAgrupado = {};

        itensVendidos.forEach(item => {
            const idProd = item.id_produto;
            const produtoInfo = mapaProdutosInfo[idProd];
            const pedidoInfo = mapaPedidos[item.id_pedido];

            // Se produto ou pedido não existirem (dados órfãos), pula
            if (!produtoInfo || !pedidoInfo) return;

            // Inicializa se não existir
            if (!resultadoAgrupado[idProd]) {
                resultadoAgrupado[idProd] = {
                    id_produto: idProd,
                    nome: produtoInfo.nome,
                    imagem: produtoInfo.imagem_url || '',
                    categoria: produtoInfo.categorias?.nome || 'Geral',
                    preco_atual: Number(produtoInfo.preco),
                    estoque_atual: produtoInfo.estoque,
                    total_vendido: 0,
                    receita_gerada: 0,
                    // Listas para o Modal
                    historico_vendas: [],
                    pedidos_ids: []
                };
            }

            // CORREÇÃO DO CAMPO PREÇO AQUI:
            // Tenta 'preco', se não tiver, tenta 'preco_unitario', se não, 0
            const precoVenda = Number(item.preco || item.preco_unitario || 0);
            const qtd = item.quantidade || 1; // Se não tiver quantidade, assume 1

            resultadoAgrupado[idProd].total_vendido += qtd;
            resultadoAgrupado[idProd].receita_gerada += (precoVenda * qtd);

            // Adiciona ao histórico
            resultadoAgrupado[idProd].historico_vendas.push({
                data: pedidoInfo.data_pedido,
                qtd: qtd,
                id_pedido: pedidoInfo.id_pedido
            });

            // Adiciona ID do pedido se não existir
            if (!resultadoAgrupado[idProd].pedidos_ids.includes(pedidoInfo.id_pedido)) {
                resultadoAgrupado[idProd].pedidos_ids.push(pedidoInfo.id_pedido);
            }
        });

        // --- 5. Formatação Final ---
        const topProducts = Object.values(resultadoAgrupado)
            .sort((a, b) => b.total_vendido - a.total_vendido)
            .slice(0, 10)
            .map(p => ({
                ...p,
                // Ordena histórico por data (mais recente primeiro)
                historico_vendas: p.historico_vendas.sort((a, b) => new Date(b.data) - new Date(a.data))
            }));

        const labels = topProducts.map(p => p.nome.length > 20 ? p.nome.substring(0, 20) + '...' : p.nome);
        const values = topProducts.map(p => p.total_vendido);
        const images = topProducts.map(p => p.imagem);

        res.json({ labels, values, images, fullData: topProducts });

    } catch (error) {
        console.error("Erro Top Produtos:", error);
        // Retorna vazio para não quebrar o front
        res.json({ labels: [], values: [], images: [], fullData: [] });
    }
};

// @desc    Obter produtos mais visualizados (Top 10)
// @route   GET /api/dashboard/most-viewed-products
// @access  Private/Admin
export const getMostViewedProducts = async (req, res, next) => {
    try {
        const { start, end } = getDatesFromQuery(req.query);

        // 1. Agrupa as visualizações (Mantido seu código funcional)
        const mostViewedGrouped = await prisma.produto_visualizacoes.groupBy({
            by: ['id_produto'],
            _sum: {
                quantidade: true
            },
            where: {
                data: { gte: start, lte: end } // ✅ Filtro de data mantido
            },
            orderBy: {
                _sum: {
                    quantidade: 'desc'
                }
            },
            take: 10
        });

        // 2. Busca detalhes COMPLETOS dos produtos (Necessário para o Modal)
        const productIds = mostViewedGrouped.map(item => item.id_produto);

        const productsDetails = await prisma.produtos.findMany({
            where: {
                id_produto: { in: productIds }
            },
            // ✅ Alterado de 'select' para 'include' para trazer tudo (preço, estoque, custo)
            include: {
                categorias: { select: { nome: true } }
            }
        });

        // 3. Junta os dados e formata
        const productMap = {};
        productsDetails.forEach(p => productMap[p.id_produto] = p);

        const labels = [];
        const values = [];
        const images = [];
        const fullData = []; // ✅ Array novo para a interatividade

        mostViewedGrouped.forEach(item => {
            const product = productMap[item.id_produto];
            const totalViews = item._sum.quantidade || 0;

            if (product) {
                // Dados para o Gráfico (Visual)
                const shortName = product.nome.length > 20 ? product.nome.substring(0, 20) + '...' : product.nome;
                
                labels.push(shortName);
                values.push(totalViews);
                images.push(product.imagem_url || '');

                // ✅ Dados para o Modal (Interativo)
                // Mescla os dados do produto com o total de views calculado
                fullData.push({
                    ...product,
                    total_views: totalViews,
                    categoria_nome: product.categorias?.nome || 'Geral'
                });
            }
        });

        // Retorna tudo, incluindo o fullData
        res.json({ labels, values, images, fullData });

    } catch (error) {
        console.error("Erro Mais Vistos:", error.message);
        // Retorna arrays vazios para não quebrar o front
        res.json({ labels: [], values: [], images: [], fullData: [] });
    }
};

// @desc    Obter status do estoque (Baixo vs Alto)
// @route   GET /api/dashboard/inventory-status
// @access  Private/Admin
// @desc    Obter status do estoque e Lucro (Filtrado por Data)
export const getInventoryStatus = async (req, res, next) => {
    try {
        const { start, end } = getDatesFromQuery(req.query);

        // 1. Estoque Baixo (Incluindo Zerados)
        // Mudamos a ordenação para 'asc' para garantir que o 0 venha primeiro
        const lowStock = await prisma.produtos.findMany({
            where: { 
                estoque: { lte: 10 }, 
                active_ecommerce: true 
            },
            orderBy: [
                { estoque: 'asc' }, // Prioridade absoluta para o que está zerado
                { nome: 'asc' }
            ],
            take: 15, // Aumentado um pouco para caber mais itens esgotados
            include: { categorias: { select: { nome: true } } }
        });

        // 2. Estoque Alto
        const highStock = await prisma.produtos.findMany({
            where: { estoque: { gte: 50 }, active_ecommerce: true },
            orderBy: { estoque: 'desc' },
            take: 10,
            include: { categorias: { select: { nome: true } } }
        });

        // 3. Mais Vendidos (BUSCA BLINDADA)
        const itensVendidos = await prisma.pedido_items.findMany({
            where: {
                pedidos: {
                    status_pagamento: 'PAGO',
                    data_pedido: { gte: start, lte: end }
                }
            }
        });

        // --- CRUZAMENTO DE DADOS (MANUAL) ---

        const todosProdutos = await prisma.produtos.findMany({
            select: {
                id_produto: true,
                nome: true,
                imagem_url: true,
                preco_custo: true,
                categorias: { select: { nome: true } }
            }
        });

        const mapaProdutosId = {};
        const mapaProdutosNome = {};

        todosProdutos.forEach(p => {
            const info = {
                id: p.id_produto,
                nome: p.nome,
                imagem: p.imagem_url,
                categoria: p.categorias?.nome || 'Geral',
                preco_custo_atual: Number(p.preco_custo || 0),
                qtd_vendida: 0,
                receita_total: 0,
                custo_total: 0
            };
            mapaProdutosId[p.id_produto] = info;
            mapaProdutosNome[p.nome] = info;
        });

        itensVendidos.forEach(item => {
            let produto = null;
            if (item.id_produto && mapaProdutosId[item.id_produto]) {
                produto = mapaProdutosId[item.id_produto];
            } else if (item.nome && mapaProdutosNome[item.nome]) {
                produto = mapaProdutosNome[item.nome];
            }

            if (produto) {
                const qtd = item.quantidade ? item.quantidade : 1;
                const precoVenda = Number(item.preco || item.preco_unitario || 0);
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

        // --- FORMATADOR ATUALIZADO PARA LIDAR COM ESTOQUE 0 ---
        const formatProductStock = (p) => {
            const custo = parseFloat(p.preco_custo || 0);
            const venda = parseFloat(p.preco || 0);
            const lucro = venda - custo;
            const margem = venda > 0 ? ((lucro / venda) * 100).toFixed(1) : 0;
            
            // Lógica de Potencial: 
            // Se tem estoque, é estoque * venda. 
            // Se está zerado, calculamos o potencial de perda (ex: simula reposição de 10 un)
            const potencialVenda = p.estoque > 0 
                ? p.estoque * venda 
                : 10 * venda; // Mostra quanto ganharia se comprasse 10 unidades agora

            return {
                id: p.id_produto,
                nome: p.nome,
                imagem: p.imagem_url,
                categoria: p.categorias?.nome || 'Geral',
                estoque: p.estoque, // Aqui vai o 0 corretamente
                preco_custo: custo,
                preco_venda: venda,
                lucro_unitario: lucro,
                margem_percentual: margem,
                capital_parado: p.estoque * custo,
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

// @desc    Detalhes de Estoque para o Modal (Lista de produtos)
export const getStockDetails = async (req, res, next) => {
    try {
        const { type } = req.query; // 'low' ou 'normal'

        let whereCondition = {
            active_ecommerce: true // Garante que não mostre produtos desativados
        };
        
        let orderBy = {};

        if (type === 'low') {
            // Foco: Produtos acabando ou já zerados
            whereCondition.estoque = { lte: 10 };
            // Ordenação: 0 primeiro, depois 1, 2, 3... (Prioridade de reposição)
            orderBy = [
                { estoque: 'asc' },
                { nome: 'asc' }
            ];
        } else {
            // Estoque saudável
            whereCondition.estoque = { gt: 10 };
            orderBy = { estoque: 'desc' };
        }

        const products = await prisma.produtos.findMany({
            where: whereCondition,
            select: {
                id_produto: true,
                nome: true,
                imagem_url: true,
                estoque: true,
                preco: true,
                preco_custo: true, // Adicionado para você ver o investimento necessário
                categorias: { select: { nome: true } }
            },
            orderBy: orderBy,
            take: 50 
        });

        // Adiciona um cálculo rápido de "Status" para o Frontend facilitar a visualização
        const formattedProducts = products.map(p => ({
            ...p,
            status: p.estoque === 0 ? 'ESGOTADO' : (p.estoque <= 5 ? 'CRÍTICO' : 'BAIXO'),
            valor_estoque_venda: Number(p.preco) * p.estoque
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

        // 1. Média e Total (Usando data_avaliacao conforme seu schema)
        const stats = await prisma.avaliacoes.aggregate({
            _avg: { nota: true },
            _count: { id_avaliacao: true },
            where: { data_avaliacao: { gte: start, lte: end } }
        });

        // 2. Distribuição (1 a 5 estrelas)
        const distribuicao = await prisma.avaliacoes.groupBy({
            by: ['nota'],
            _count: { nota: true },
            where: { data_avaliacao: { gte: start, lte: end } }
        });

        // 3. Feed de avaliações (Integrando com produtos e usuários)
        const recentes = await prisma.avaliacoes.findMany({
            take: 8,
            where: { data_avaliacao: { gte: start, lte: end } },
            orderBy: { data_avaliacao: 'desc' },
            include: {
                produtos: {
                    select: { id_produto: true, nome: true, imagem_url: true }
                },
                usuarios: {
                    select: { nome_completo: true, email: true }
                }
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