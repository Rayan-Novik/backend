import express from 'express';
const router = express.Router();
import {
    // Funções do seu código original
    getProductSalesReports,
    getMostViewedProducts,
    getCustomerFeedback,
    // Novas funções que criámos
    getSalesPerformanceReport,
    getTopSellingProductsReport,
    getProductPerformanceReport
} from '../controllers/relatorioController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';

// Protege todas as rotas para serem acedidas apenas por administradores
router.use(protect, admin);

// --- ROTAS PARA OS RELATÓRIOS SIMPLES (do seu código original) ---
router.get('/product-sales', getProductSalesReports);
router.get('/most-viewed', getMostViewedProducts);
router.get('/feedback', getCustomerFeedback);

// --- ROTAS PARA OS RELATÓRIOS AVANÇADOS (novas) ---
router.get('/sales-performance', getSalesPerformanceReport);
router.get('/top-selling', getTopSellingProductsReport);
router.get('/product-performance', getProductPerformanceReport);

export default router;

