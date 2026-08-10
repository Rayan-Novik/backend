import express from 'express';
const router = express.Router();
import { 
    createMarketingCampaign, 
    trackCampaignClick, 
    getMarketingCampaigns,
    deleteMarketingCampaign,
    getActiveCampaigns,
    getCampaignBySlug,
    getFacebookProductFeed,
    postarNoFeed,
    criarCampanhaPaga
} from '../controllers/custom/marketingController.js';

import { protect } from '../middlewares/authMiddleware.js';
import { requirePermission } from '../middlewares/permissionMiddleware.js';

// ==========================================
// ROTAS PÚBLICAS (Para a Vitrine do E-commerce)
// ==========================================
router.get('/active/:tenantId', getActiveCampaigns);
router.get('/track/:slug/:tenantId', trackCampaignClick);
router.get('/campaign/:slug/:tenantId', getCampaignBySlug);

// ==========================================
// ROTAS PRIVADAS (Para o Painel Admin)
// ==========================================

// Visualizar e gerenciar campanhas internas
router.get('/campaigns', protect, requirePermission('MARKETING_VIEW'), getMarketingCampaigns);
router.post('/campaigns', protect, requirePermission('MARKETING_MANAGE'), createMarketingCampaign);
router.delete('/campaigns/:id', protect, requirePermission('MARKETING_MANAGE'), deleteMarketingCampaign);

// Rotas de Redes Sociais / Tráfego Pago (Ações que envolvem APIs externas e custos)
router.get('/facebook-feed', protect, requirePermission('MARKETING_MANAGE'), getFacebookProductFeed);
router.post('/produtos/:id/postar-organico', protect, requirePermission('MARKETING_MANAGE'), postarNoFeed);
router.post('/produtos/:id/criar-anuncio-pago', protect, requirePermission('MARKETING_MANAGE'), criarCampanhaPaga);

export default router;