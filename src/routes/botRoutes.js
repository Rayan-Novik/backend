// routes/botRoutes.js
import express from 'express';
import { 
    testAbandonedCarts, 
    testPendingPayments, 
    testEmailSending,
    getBotConfig,    // ✅ Importado
    updateBotConfig  // ✅ Importado
} from '../controllers/botController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';

const router = express.Router();

// ============================================================================
//                          ROTAS DE CONFIGURAÇÃO (AGENTE IA)
// ============================================================================

// Rota para ler e salvar as configurações do bot
// GET /api/bot/config  -> Busca configs
// POST /api/bot/config -> Salva configs
router.route('/config')
    .get(protect, admin, getBotConfig)
    .post(protect, admin, updateBotConfig);


// ============================================================================
//                          ROTAS DE TESTE MANUAL
// ============================================================================

// Define as rotas de teste, protegidas para que só o admin possa usá-las
router.get('/test-abandoned-cart', protect, admin, testAbandonedCarts);
router.get('/test-pending-payment', protect, admin, testPendingPayments);
router.get('/test-email', protect, admin, testEmailSending);

export default router;