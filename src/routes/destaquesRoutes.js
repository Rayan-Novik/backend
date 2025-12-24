import express from 'express';
const router = express.Router();
import {
    getActiveDestaques,
    getAllDestaques,
    createDestaque,
    updateDestaque,
    deleteDestaque
} from '../controllers/destaquesController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';

// Rota pública para o e-commerce
router.get('/active', getActiveDestaques);

// Rotas de admin para gerir os destaques
router.route('/')
    .get(protect, admin, getAllDestaques)
    .post(protect, admin, createDestaque);

router.route('/:id')
    .put(protect, admin, updateDestaque)
    .delete(protect, admin, deleteDestaque);

export default router;
