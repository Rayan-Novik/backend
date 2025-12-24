import express from 'express';
const router = express.Router();
import {
    getFreteSettings,
    updateFreteSettings,
    calcularFrete
} from '../controllers/freteController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';

// ✅ CORREÇÃO: Adicionado o middleware 'protect' a esta rota.
// Agora, apenas utilizadores logados podem calcular o frete.
router.post('/calcular', protect, calcularFrete);

// Rotas de admin para gerir as configurações
router.route('/settings')
    .get(protect, admin, getFreteSettings)
    .put(protect, admin, updateFreteSettings);

export default router;
