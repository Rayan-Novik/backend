import express from 'express';
const router = express.Router();
import {
    getActiveDestaques,
    getAllDestaques,
    createDestaque,
    updateDestaque,
    deleteDestaque
} from '../controllers/custom/destaquesController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { requirePermission } from '../middlewares/permissionMiddleware.js';

// Rota pública para o e-commerce
router.get('/active/:tenantId', getActiveDestaques);

// Rotas de admin para gerir os destaques (Aparência da Loja)
router.route('/')
    .get(protect, requirePermission('CONFIG_APARENCIA'), getAllDestaques)
    .post(protect, requirePermission('CONFIG_APARENCIA'), createDestaque);

router.route('/:id')
    .put(protect, requirePermission('CONFIG_APARENCIA'), updateDestaque)
    .delete(protect, requirePermission('CONFIG_APARENCIA'), deleteDestaque);

export default router;