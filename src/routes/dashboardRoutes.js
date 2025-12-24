import express from 'express';
const router = express.Router();
// ✅ 1. Importa as novas funções do controller, que já englobam as antigas
import {
    getDashboardKPIs,
    getDetailedSalesChartData,
    getRecentConfirmedOrders
} from '../controllers/dashboardController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';

// Protege todas as rotas para serem acedidas apenas por administradores
router.use(protect, admin);

// ✅ 2. Rota para buscar os KPIs (Faturamento, Lucro, Pedidos, etc.) com filtro de período
// Esta rota substitui a sua antiga rota '/stats' com dados mais completos.
router.route('/kpis').get(getDashboardKPIs);


// ✅ 3. Rota para buscar os dados do gráfico de faturamento detalhado (últimos 30 dias)
// Esta rota substitui a sua antiga rota '/sales-data' com uma lógica mais avançada.
router.route('/detailed-sales-chart').get(getDetailedSalesChartData);

router.route('/recent-confirmed-orders').get(getRecentConfirmedOrders);

// Nota: A funcionalidade de 'pedidos recentes' foi integrada na rota de KPIs para otimizar o carregamento.

export default router;

