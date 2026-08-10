import express from 'express';
import { 
    getHeroBannerSettings,
    updateHeroBannerSettings,
    getActiveHeroBanner
} from '../controllers/custom/heroBannerController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { requirePermission } from '../middlewares/permissionMiddleware.js';

const router = express.Router();

// 🟢 ROTA PÚBLICA (Fica acessível em /api/hero-banner/public/1)
router.get('/public/:tenantId', getActiveHeroBanner);

// Rota pública antiga (opcional, mantida caso alguma outra parte do sistema ainda use)
router.get('/', getActiveHeroBanner);

// 🔴 ROTAS PROTEGIDAS PARA O PAINEL DE ADMINISTRAÇÃO
router.route('/settings')
    .get(protect, requirePermission('CONFIG_APARENCIA'), getHeroBannerSettings)
    .put(protect, requirePermission('CONFIG_APARENCIA'), updateHeroBannerSettings);

export default router;