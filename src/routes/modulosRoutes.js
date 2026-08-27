import express from 'express';
import { getModulos, updateModulos } from '../controllers/modulosController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

// As duas rotas estarão protegidas pelo token de login
router.get('/', protect, getModulos);
router.put('/', protect, updateModulos);

export default router;