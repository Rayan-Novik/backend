import express from 'express';
const router = express.Router();
import {
    getAppearanceSettings,
    updateAppearanceSettings,
    getPublicConfiguracoes,
    getPixDiscountConfig,
    updatePixDiscountConfig,
    getHomepageLayout,
    updateHomepageLayout,
    getConfiguracaoByKey, 
    saveConfiguracao,
    getPaymentConfig,
    getStorePublicConfig,
    getConfiguracoesGerais,
    updateConfiguracoesGerais
} from '../controllers/configuracaoController.js';

import { protect } from '../middlewares/authMiddleware.js';
import { requirePermission } from '../middlewares/permissionMiddleware.js';

// ==========================================================
// 🔓 ROTAS PÚBLICAS (Para a Vitrine / Checkout)
// ==========================================================

// 🟢 CORREÇÃO DO ERRO 404: Esta rota aceita a palavra 'default' ou o tenantId/slug para carregar a vitrine!
router.get('/public/:tenantId', getStorePublicConfig);

router.get('/public', getPublicConfiguracoes);
router.get('/payment-config', getPaymentConfig);
router.get('/appearance', getAppearanceSettings); // Get público para carregar as cores
router.get('/pix-desconto', getPixDiscountConfig);
router.get('/homepage-layout', getHomepageLayout);

// ==========================================================
// 🛡️ ROTAS ADMINISTRATIVAS (Protegidas por Permissão)
// ==========================================================

// 1. Configurações Gerais (Unidades / Retirada)
router.route('/gerais')
    .get(protect, requirePermission('CONFIG_UNIDADES'), getConfiguracoesGerais)
    .put(protect, requirePermission('CONFIG_UNIDADES'), updateConfiguracoesGerais);

// 2. Aparência e Layout da Loja
router.put('/appearance', protect, requirePermission('CONFIG_APARENCIA'), updateAppearanceSettings);
router.post('/homepage-layout', protect, requirePermission('CONFIG_APARENCIA'), updateHomepageLayout);

// 3. Financeiro (Desconto Pix)
router.post('/pix-desconto', protect, requirePermission('CONFIG_PIX'), updatePixDiscountConfig);

// 4. Rota genérica para salvar (Unitário)
// Como é genérica, o ideal é manter uma permissão mais alta ou de integração
router.post('/', protect, requirePermission('CONFIG_INTEGRATIONS'), saveConfiguracao);

// ==================================================================
// 🚀 ROTA DINÂMICA (DEVE SEMPRE FICAR NO FINAL DO ARQUIVO)
// ==================================================================
// Busca por chave específica - requer permissão de integrador/admin
router.get('/:chave', protect, requirePermission('CONFIG_INTEGRATIONS'), getConfiguracaoByKey);
    
export default router;