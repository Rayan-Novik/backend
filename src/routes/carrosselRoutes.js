import express from 'express';
const router = express.Router();
import {
    getActiveSlides,
    getAllSlides,
    createSlide,
    updateSlide,
    deleteSlide
} from '../controllers/custom/carrosselController.js';

import { protect } from '../middlewares/authMiddleware.js';
import { requirePermission } from '../middlewares/permissionMiddleware.js';

// Rota pública para o e-commerce (Não precisa de login)
router.get('/active/:tenantId', getActiveSlides);

// Rotas da equipe para gerir os slides (Exige permissão de Aparência)
router.route('/')
    .get(protect, requirePermission('CONFIG_APARENCIA'), getAllSlides)
    .post(protect, requirePermission('CONFIG_APARENCIA'), createSlide);

router.route('/:id')
    .put(protect, requirePermission('CONFIG_APARENCIA'), updateSlide)
    .delete(protect, requirePermission('CONFIG_APARENCIA'), deleteSlide);

export default router;