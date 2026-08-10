import express from 'express';
const router = express.Router();
import {
    getMercadoLivreKeyStatus,
    updateMercadoLivreKey,
    getTikTokKeyStatus,
    updateTikTokKeys,
    getMercadoPagoGatewayKeys,
    updateMercadoPagoGatewayKeys,
    // ImgBB
    getImgBBKeyStatus,
    updateImgBBKey,
    // Facebook
    updateFacebookKeys,
    getFacebookKeys,
    // Cloudinary
    getCloudinaryKeys,
    updateCloudinaryKeys,
    // Stripe
    getStripeKeyStatus, 
    updateStripeKeys,
    // Asaas
    getAsaasKeyStatus,
    updateAsaasKeys,
    // Cielo
    getCieloKeyStatus,
    updateCieloKeys,
    // 🚀 FUNÇÕES DA API PÚBLICA
    getPublicApiKeys,
    createPublicApiKey,
    deletePublicApiKey,
    getWebhookSettings,
    saveWebhookSettings,
    testWebhook
} from '../controllers/apiKeysController.js';

import { protect } from '../middlewares/authMiddleware.js';
// 🟢 Importando a nossa nova catraca inteligente!
import { requirePermission } from '../middlewares/permissionMiddleware.js';

// ============================================================================
// 🛒 MARKETPLACES, REDES SOCIAIS E ARMAZENAMENTO DE IMAGEM
// Permissão Exigida: CONFIG_INTEGRATIONS
// ============================================================================

// Mercado Livre
router.route('/mercadolivre')
    .get(protect, requirePermission('CONFIG_INTEGRATIONS'), getMercadoLivreKeyStatus)
    .put(protect, requirePermission('CONFIG_INTEGRATIONS'), updateMercadoLivreKey);

// TikTok
router.route('/tiktok')
    .get(protect, requirePermission('CONFIG_INTEGRATIONS'), getTikTokKeyStatus)
    .put(protect, requirePermission('CONFIG_INTEGRATIONS'), updateTikTokKeys);

// ImgBB
router.route('/imgbb')
    .get(protect, requirePermission('CONFIG_INTEGRATIONS'), getImgBBKeyStatus)
    .put(protect, requirePermission('CONFIG_INTEGRATIONS'), updateImgBBKey);

// Cloudinary
router.route('/cloudinary')
    .get(protect, requirePermission('CONFIG_INTEGRATIONS'), getCloudinaryKeys)
    .put(protect, requirePermission('CONFIG_INTEGRATIONS'), updateCloudinaryKeys);

// Facebook
router.route('/facebook')
    .get(protect, requirePermission('CONFIG_INTEGRATIONS'), getFacebookKeys)
    .post(protect, requirePermission('CONFIG_INTEGRATIONS'), updateFacebookKeys)
    .put(protect, requirePermission('CONFIG_INTEGRATIONS'), updateFacebookKeys);


// ============================================================================
// 💳 GATEWAYS DE PAGAMENTO
// Permissão Exigida: CONFIG_GATEWAYS
// ============================================================================

// Mercado Pago
router.route('/mercadopago')
    .get(protect, requirePermission('CONFIG_GATEWAYS'), getMercadoPagoGatewayKeys)
    .put(protect, requirePermission('CONFIG_GATEWAYS'), updateMercadoPagoGatewayKeys);

// Stripe
router.route('/stripe')
    .get(protect, requirePermission('CONFIG_GATEWAYS'), getStripeKeyStatus)
    .post(protect, requirePermission('CONFIG_GATEWAYS'), updateStripeKeys);

// Asaas
router.route('/asaas')
    .get(protect, requirePermission('CONFIG_GATEWAYS'), getAsaasKeyStatus)
    .post(protect, requirePermission('CONFIG_GATEWAYS'), updateAsaasKeys)
    .put(protect, requirePermission('CONFIG_GATEWAYS'), updateAsaasKeys);

// Cielo
router.route('/cielo')
    .get(protect, requirePermission('CONFIG_GATEWAYS'), getCieloKeyStatus)
    .put(protect, requirePermission('CONFIG_GATEWAYS'), updateCieloKeys) 
    .post(protect, requirePermission('CONFIG_GATEWAYS'), updateCieloKeys); 


// ============================================================================
// 🚀 ROTAS: API PÚBLICA (ERP / Webhooks / Desenvolvedores)
// Permissão Exigida: CONFIG_INTEGRATIONS
// ============================================================================

router.route('/public-keys')
    .get(protect, requirePermission('CONFIG_INTEGRATIONS'), getPublicApiKeys)
    .post(protect, requirePermission('CONFIG_INTEGRATIONS'), createPublicApiKey);

router.route('/public-keys/:id')
    .delete(protect, requirePermission('CONFIG_INTEGRATIONS'), deletePublicApiKey);

// 🚀 ROTAS DO WEBHOOK
router.route('/webhooks/settings')
    .get(protect, requirePermission('CONFIG_INTEGRATIONS'), getWebhookSettings)
    .post(protect, requirePermission('CONFIG_INTEGRATIONS'), saveWebhookSettings);

router.route('/webhooks/testar')
    .get(protect, requirePermission('CONFIG_INTEGRATIONS'), testWebhook);

export default router;