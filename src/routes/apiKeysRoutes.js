import express from 'express';
const router = express.Router();
import {
    getMercadoLivreKeyStatus,
    updateMercadoLivreKey,
    getTikTokKeyStatus,
    updateTikTokKeys,
    getMercadoPagoGatewayKeys,
    updateMercadoPagoGatewayKeys,
    // ✅ Importa as novas funções do ImgBB
    getImgBBKeyStatus,
    updateImgBBKey
} from '../controllers/apiKeysController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';

// Mercado Livre
router.route('/mercadolivre')
    .get(protect, admin, getMercadoLivreKeyStatus)
    .put(protect, admin, updateMercadoLivreKey);

// TikTok
router.route('/tiktok')
    .get(protect, admin, getTikTokKeyStatus)
    .put(protect, admin, updateTikTokKeys);

// Mercado Pago
router.route('/mercadopago')
    .get(protect, admin, getMercadoPagoGatewayKeys)
    .put(protect, admin, updateMercadoPagoGatewayKeys);

// ✅ NOVA ROTA: ImgBB
router.route('/imgbb')
    .get(protect, admin, getImgBBKeyStatus)
    .put(protect, admin, updateImgBBKey);

export default router;