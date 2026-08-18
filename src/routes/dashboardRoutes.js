import express from 'express';
const router = express.Router();

import {
    getDashboardKPIs,
    getChartData, // ✅ Nova função importada
    getDetailedSalesChartData,
    getRecentConfirmedOrders,
    getTopSellingProducts,
    getMostViewedProducts,
    getInventoryStatus,
    getStockDetails,
    getReviewsSummary,
    getProductAuditChartData,
    getSalesDetails,
} from '../controllers/dashboardController.js';

import { protect } from '../middlewares/authMiddleware.js';
// 🟢 Importando a nossa catraca inteligente
import { requirePermission } from '../middlewares/permissionMiddleware.js';

// --- SEGURANÇA GLOBAL ---
// Aplica proteção para todas as rotas abaixo de uma só vez!
// 🟢 Trocamos o 'admin' cego pela permissão específica do Dashboard
router.use(protect, requirePermission('DASHBOARD_VIEW'));

// --- ROTAS DE DASHBOARD ---

// 1. KPIs Gerais (Cards do topo: Faturamento, Lucro, etc.)
router.get('/kpis', getDashboardKPIs);

// 2. Dados para Gráficos Gerais (Pizza e Linha Simples) - ✅ NOVA ROTA
router.get('/charts', getChartData);

// 3. Gráfico Detalhado (Comparativo E-commerce vs ML)
router.get('/detailed-sales-chart', getDetailedSalesChartData);

// 4. Pedidos Recentes
router.get('/recent-confirmed-orders', getRecentConfirmedOrders);

// 5. Produtos Mais Vendidos (Top 10)
router.get('/top-products', getTopSellingProducts);

// 6. Produtos Mais Visualizados
router.get('/most-viewed-products', getMostViewedProducts);

// 7. Status de Estoque (Resumo Baixo/Alto)
router.get('/inventory-status', getInventoryStatus);

// 8. Detalhes de Estoque (Para Modais e Listas Completas)
router.get('/stock-details', getStockDetails);

router.get('/sales-details', protect, getSalesDetails);

// 9. Resumo de Avaliações
router.get('/reviews-summary', getReviewsSummary);

router.get('/audit-chart', getProductAuditChartData);

export default router;