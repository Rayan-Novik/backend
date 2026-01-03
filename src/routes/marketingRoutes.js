import express from 'express';
const router = express.Router();
// Adicione o 'getMarketingCampaigns' (vamos criar no controller abaixo)
import { 
    createMarketingCampaign, 
    trackCampaignClick, 
    getMarketingCampaigns,
    deleteMarketingCampaign
} from '../controllers/marketingController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';

// Rota para o Frontend listar as campanhas (GET /api/marketing/campaigns)
router.get('/campaigns', protect, admin, getMarketingCampaigns);

// Rota para criar (POST /api/marketing/campaigns)
router.post('/campaigns', protect, admin, createMarketingCampaign);

// Rota para deletar (DELETE /api/marketing/campaigns)
router.delete('/campaigns/:id', protect, admin, deleteMarketingCampaign);

// Rota pública de rastreio
router.get('/track/:slug', trackCampaignClick);

export default router;