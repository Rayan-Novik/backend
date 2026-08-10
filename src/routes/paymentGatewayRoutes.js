import express from 'express';
const router = express.Router();

import {
    getRoutingRules,
    updateRoutingRules,
    getCredentials,
    updateCredentials,
    getPublicKeys,
    applyGlobalPreset,
    getPaymentOptions,
    getGatewayTaxes,
    updateGatewayTaxes,
    getActiveGatewaysForCheckout,
    getGatewayConfig, // 🟢 NOVO IMPORT
    setGatewayConfig  // 🟢 NOVO IMPORT
} from '../controllers/paymentGatewayController.js';

import { protect } from '../middlewares/authMiddleware.js';
import { requirePermission } from '../middlewares/permissionMiddleware.js';

// ============================================================
// 🔓 PÚBLICAS (CHECKOUT DA LOJA VIRTUAL)
// ============================================================
router.get('/active-methods', getActiveGatewaysForCheckout);
router.get('/public-keys', getPublicKeys);
router.get('/mercadopago-public-key', getPublicKeys);

// ============================================================
// 1. PAINEL DE ROTEAMENTO (MODULAR E GLOBAL) - PROTEGIDAS
// ============================================================
router.get('/gateways', protect, requirePermission('CONFIG_GATEWAYS'), getRoutingRules);
router.get('/gateways/options', protect, requirePermission('CONFIG_GATEWAYS'), getPaymentOptions);

router.post('/gateways/update', protect, requirePermission('CONFIG_GATEWAYS'), updateRoutingRules);
router.post('/gateways/preset', protect, requirePermission('CONFIG_GATEWAYS'), applyGlobalPreset);

// ============================================================
// 📊 GESTÃO DE TAXAS (MAQUININHAS E GATEWAYS)
// ============================================================
router.get('/taxes', protect, requirePermission('CONFIG_GATEWAYS'), getGatewayTaxes);
router.post('/taxes', protect, requirePermission('CONFIG_GATEWAYS'), updateGatewayTaxes);

// ============================================================
// ⚙️ CONFIGURAÇÕES DIVERSAS (EX: SINAL AGENDAMENTO) 🟢 NOVO
// ============================================================
router.get('/config/:chave', protect, requirePermission('CONFIG_GATEWAYS'), getGatewayConfig);
router.post('/config', protect, requirePermission('CONFIG_GATEWAYS'), setGatewayConfig);

// ============================================================
// 🔑 PAINEL DE CHAVES (CREDENTIALS)
// ============================================================
router.route('/credentials')
    .get(protect, requirePermission('CONFIG_GATEWAYS'), getCredentials)
    .put(protect, requirePermission('CONFIG_GATEWAYS'), updateCredentials);

router.route('/')
    .get(protect, requirePermission('CONFIG_GATEWAYS'), getCredentials)
    .put(protect, requirePermission('CONFIG_GATEWAYS'), updateCredentials);

export default router;