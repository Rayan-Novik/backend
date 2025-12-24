import express from 'express';
import { 
    getHeroBannerSettings,
    updateHeroBannerSettings,
    getActiveHeroBanner
} from '../controllers/heroBannerController.js';
// ✅ CORREÇÃO: Os imports foram separados para buscar cada middleware do seu ficheiro correto.
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';

const router = express.Router();

// Rota pública para a loja buscar o banner ativo
router.get('/', getActiveHeroBanner);

// Rotas protegidas para o painel de administração
router.route('/settings')
    .get(protect, admin, getHeroBannerSettings)
    .put(protect, admin, updateHeroBannerSettings);

export default router;