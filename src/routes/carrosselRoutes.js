import express from 'express';
const router = express.Router();
import {
    getActiveSlides,
    getAllSlides,
    createSlide,
    updateSlide,
    deleteSlide
} from '../controllers/carrosselController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';

// Rota pública para o e-commerce
router.get('/active', getActiveSlides);

// Rotas de admin para gerir os slides
router.route('/')
    .get(protect, admin, getAllSlides)
    .post(protect, admin, createSlide);

router.route('/:id')
    .put(protect, admin, updateSlide)
    .delete(protect, admin, deleteSlide);

export default router;
