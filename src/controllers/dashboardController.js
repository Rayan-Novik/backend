import { PrismaClient } from '@prisma/client';
import { startOfToday, subDays, format } from 'date-fns';
import { getValidAccessToken } from '../services/mercadoLivreService.js';
import axios from 'axios';

const prisma = new PrismaClient();

// Função auxiliar para definir o período de datas
const getPeriodDates = (period) => {
    const endDate = new Date();
    let startDate;

    switch (period) {
        case 'today':
            startDate = startOfToday();
            break;
        case '7d':
            startDate = subDays(endDate, 7);
            break;
        case '30d':
        default:
            startDate = subDays(endDate, 30);
            break;
    }
    return { startDate, endDate };
};

// @desc      Obter todos os KPIs para o dashboard principal
// @route     GET /api/dashboard/kpis?period=7d
// @access    Private/Admin
export const getDashboardKPIs = async (req, res, next) => {
    try {
        const { period = '30d' } = req.query;
        const { startDate, endDate } = getPeriodDates(period);

        // --- 1. KPIs do E-commerce (com Prisma) ---
        const pedidosPagos = await prisma.pedidos.findMany({
            where: {
                data_pedido: { gte: startDate, lte: endDate },
                status_pagamento: 'PAGO',
                // Garante que estamos pegando apenas pedidos do e-commerce
                canal_venda: 'ecommerce' 
            }
        });

        const faturamentoEcommerce = pedidosPagos.reduce((sum, pedido) => sum + parseFloat(pedido.preco_total), 0);
        const pedidosEcommerce = pedidosPagos.length;
        
        // --- 2. KPIs do Mercado Livre (via API) ---
        let kpisML = { faturamento: 0, pedidos: 0 };
        try {
            const accessToken = await getValidAccessToken();
            const { data: userData } = await axios.get('https://api.mercadolibre.com/users/me', { headers: { 'Authorization': `Bearer ${accessToken}` } });
            const sellerId = userData.id;

            const { data: ordersData } = await axios.get('https://api.mercadolibre.com/orders/search', {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                params: {
                    seller: sellerId,
                    "order.status": 'paid',
                    "order.date_created.from": startDate.toISOString(),
                    "order.date_created.to": endDate.toISOString(),
                }
            });
            
            if (ordersData.results) {
                kpisML.pedidos = ordersData.paging.total;
                kpisML.faturamento = ordersData.results.reduce((sum, order) => sum + order.total_amount, 0);
            }
        } catch (mlError) {
            console.error("Não foi possível buscar os KPIs do Mercado Livre:", mlError.response?.data || mlError.message);
            // Continua mesmo se a API do ML falhar
        }

        // --- 3. Combina todos os dados ---
        const faturamentoTotal = faturamentoEcommerce + kpisML.faturamento;
        const pedidosTotais = pedidosEcommerce + kpisML.pedidos;
        
        const kpisCombinados = {
            faturamentoTotal,
            pedidosTotais,
            ticketMedioTotal: pedidosTotais > 0 ? faturamentoTotal / pedidosTotais : 0,
            
            faturamentoEcommerce,
            pedidosEcommerce,

            faturamentoML: kpisML.faturamento,
            pedidosML: kpisML.pedidos,
        };
        
        // Mantém os outros KPIs que você já tinha, se necessário
        const novosClientes = await prisma.usuarios.count({
            where: { data_criacao: { gte: startDate, lte: endDate }, isAdmin: false }
        });

        res.json({
            ...kpisCombinados,
            novosClientes
        });

    } catch (error) {
        next(error);
    }
};


// @desc    Obter dados de vendas diárias para o gráfico do dashboard
// @route   GET /api/dashboard/detailed-sales-chart
// @access  Private/Admin
export const getDetailedSalesChartData = async (req, res, next) => {
    try {
        const endDate = new Date();
        const startDate = subDays(endDate, 29); // 30 dias no total
        startDate.setHours(0, 0, 0, 0);

        // --- 1. Inicializa o objeto para guardar as vendas diárias ---
        const salesByDay = {};
        const labels = [];
        for (let i = 29; i >= 0; i--) {
            const day = format(subDays(endDate, i), 'yyyy-MM-dd');
            labels.push(format(new Date(day), 'dd/MM'));
            salesByDay[day] = { ecommerce: 0, ml: 0 };
        }

        // --- 2. Busca e processa dados do E-commerce (Prisma) ---
        const ecommerceOrders = await prisma.pedidos.findMany({
            where: {
                data_pedido: { gte: startDate, lte: endDate },
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

        // --- 3. Busca e processa dados do Mercado Livre (API) ---
        try {
            const accessToken = await getValidAccessToken();
            const { data: userData } = await axios.get('https://api.mercadolibre.com/users/me', { headers: { 'Authorization': `Bearer ${accessToken}` } });
            const sellerId = userData.id;

            const { data: mlOrdersData } = await axios.get('https://api.mercadolibre.com/orders/search', {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                params: {
                    seller: sellerId,
                    "order.status": 'paid',
                    "order.date_created.from": startDate.toISOString(),
                    "order.date_created.to": endDate.toISOString(),
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
            console.error("Não foi possível buscar os dados do gráfico do ML:", mlError.response?.data || mlError.message);
        }

        // --- 4. Prepara os dados para enviar ao frontend ---
        const sortedDays = Object.keys(salesByDay).sort();
        const ecommerceDataPoints = sortedDays.map(day => salesByDay[day].ecommerce);
        const mlDataPoints = sortedDays.map(day => salesByDay[day].ml);
        
        res.json({
            labels,
            ecommerceData: ecommerceDataPoints,
            mlData: mlDataPoints
        });
        
    } catch (error) {
        next(error);
    }
};

// @desc    Obter os 5 últimos pedidos confirmados
// @route   GET /api/dashboard/recent-orders
// @access  Private/Admin
export const getRecentConfirmedOrders = async (req, res, next) => {
    try {
        // --- 1. Busca os 5 últimos pedidos do E-commerce ---
        const ecommerceOrders = await prisma.pedidos.findMany({
            take: 5,
            where: { status_pagamento: 'PAGO' },
            orderBy: { data_pedido: 'desc' },
            // ✅ CORREÇÃO AQUI: Incluindo os dados do usuário relacionado
            include: { 
                usuarios: { 
                    select: { nome_completo: true } 
                } 
            }
        });

        // Mapeia para um formato padrão, agora com o nome do usuário
        const formattedEcommerceOrders = ecommerceOrders.map(order => ({
            id_pedido: order.id_pedido,
            // ✅ CORREÇÃO AQUI: Acessando o nome do usuário incluído
            nome_completo: order.usuarios?.nome_completo || 'Cliente Removido',
            preco_total: order.preco_total,
            data_pedido: order.data_pedido,
            origem: 'ecommerce'
        }));


        // --- 2. Busca os 5 últimos pedidos do Mercado Livre ---
        let formattedMLOrders = [];
        try {
            const accessToken = await getValidAccessToken();
            const { data: userData } = await axios.get('https://api.mercadolibre.com/users/me', { headers: { 'Authorization': `Bearer ${accessToken}` } });
            const sellerId = userData.id;

            const { data: mlOrdersData } = await axios.get('https://api.mercadolibre.com/orders/search', {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                params: {
                    seller: sellerId,
                    "order.status": 'paid',
                    sort: 'date_desc',
                    limit: 5
                }
            });

            if (mlOrdersData.results) {
                formattedMLOrders = mlOrdersData.results.map(order => ({
                    id_pedido: order.id,
                    nome_completo: order.buyer.nickname, // O nome aqui é o nickname do ML
                    preco_total: order.total_amount,
                    data_pedido: order.date_created,
                    origem: 'mercadolivre'
                }));
            }
        } catch (mlError) {
            console.error("Não foi possível buscar os pedidos recentes do ML:", mlError.response?.data || mlError.message);
        }

        // --- 3. Combina, ordena por data e pega os 5 mais recentes ---
        const combinedOrders = [...formattedEcommerceOrders, ...formattedMLOrders]
            .sort((a, b) => new Date(b.data_pedido) - new Date(a.data_pedido))
            .slice(0, 5);

        res.json(combinedOrders);

    } catch (error) {
        next(error);
    }
};