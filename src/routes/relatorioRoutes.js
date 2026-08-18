import express from 'express';
const router = express.Router();
import {
    getProductSalesReports,
    getMostViewedProducts,
    getCustomerFeedback,
    getSalesPerformanceReport,
    getTopSellingProductsReport,
    getProductPerformanceReport,
    getPrevisaoCompra,
    getFaturamentoReport,
    getRelatorioCustos,
    getRelatorioLucratividade
} from '../controllers/relatorioController.js';

import { protect } from '../middlewares/authMiddleware.js';
// 🟢 Importando a nossa catraca inteligente
import { requirePermission } from '../middlewares/permissionMiddleware.js';

// ==========================================================
// 🛡️ SEGURANÇA GLOBAL DE RELATÓRIOS
// ==========================================================
// Bloqueia qualquer um que não tenha permissão de visualização básica
router.use(protect, requirePermission('RELATORIOS_VIEW'));

// --- ROTAS PARA OS RELATÓRIOS SIMPLES ---
router.get('/product-sales', getProductSalesReports);
router.get('/most-viewed', getMostViewedProducts);
router.get('/feedback', getCustomerFeedback);

// --- ROTAS PARA OS RELATÓRIOS AVANÇADOS ---
router.get('/sales-performance', getSalesPerformanceReport);
router.get('/top-selling', getTopSellingProductsReport);
router.get('/product-performance', getProductPerformanceReport);

// ==========================================================
// 🟢 REBAIXAMOS A SEGURANÇA AQUI:
// Agora requer apenas 'RELATORIOS_VIEW' em vez de 'CONTAS_MANAGE'
// ==========================================================
router.get('/faturamento', getFaturamentoReport); // Já está protegido pelo router.use lá em cima
router.get('/custos', getRelatorioCustos);
router.get('/lucratividade', getRelatorioLucratividade);

// --- OPERACIONAL ---
router.get('/previsao-estoque', getPrevisaoCompra);

export default router;