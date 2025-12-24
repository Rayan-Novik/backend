import express from 'express';
const router = express.Router();
import {
    getMercadoLivreKeyStatus,
    updateMercadoLivreKey,
    getTikTokKeyStatus,
    updateTikTokKeys,
    // ✅ 1. Importa as novas funções do controller
    getMercadoPagoGatewayKeys,
    updateMercadoPagoGatewayKeys
} from '../controllers/apiKeysController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';

// Rotas existentes
router.route('/mercadolivre')
    .get(protect, admin, getMercadoLivreKeyStatus)
    .put(protect, admin, updateMercadoLivreKey);

router.route('/tiktok')
    .get(protect, admin, getTikTokKeyStatus)
    .put(protect, admin, updateTikTokKeys);

// ✅ 2. Adiciona a nova rota para o Mercado Pago
router.route('/mercadopago')
    .get(protect, admin, getMercadoPagoGatewayKeys)
    .put(protect, admin, updateMercadoPagoGatewayKeys);

export default router;

