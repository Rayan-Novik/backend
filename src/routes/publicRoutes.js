import express from 'express';
const router = express.Router();
import { getActiveCampaigns, getCampaignBySlug, trackCampaignClick, getFacebookProductFeed, postarNoFeed, criarCampanhaPaga} from '../controllers/marketingController.js';

// Rota que a HomePage chama
router.get('/marketing/active', getActiveCampaigns);

router.get('/marketing/track/:slug', trackCampaignClick);

// Rota para a Landing Page da campanha
router.get('/marketing/campaign/:slug', getCampaignBySlug);

router.get('/facebook-feed', getFacebookProductFeed);

router.post('/produtos/:id/postar-organico', postarNoFeed);

router.post('/produtos/:id/criar-anuncio-pago', criarCampanhaPaga);

export default router;