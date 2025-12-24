import express from 'express';
const router = express.Router();
import {
    getProductReviews,
    createProductReview,
    getAdminReviews, // Novo
    replyReview      // Novo
} from '../controllers/avaliacaoController.js';

// Importe seu middleware de admin aqui. Se não tiver um arquivo separado, 
// certifique-se de validar se o usuário é admin.
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';

// --- ROTAS DE PRODUTO (Públicas/Usuário) ---

// Buscar avaliações de um produto
router.route('/:id/reviews').get(getProductReviews);

// Usuário cria avaliação (com suporte a imagem agora)
router.route('/:id/reviews').post(protect, createProductReview);


// --- ROTAS ADMIN (Painel de Controle) ---
// Nota: Estas rotas não dependem do ID do produto, mas sim do ID da avaliação

// Listar todas as avaliações da loja
// GET /api/avaliacoes/admin/all
router.route('/admin/all').get(protect, admin, getAdminReviews);

// Responder uma avaliação específica
// PUT /api/avaliacoes/admin/:id/reply
router.route('/admin/:id/reply').put(protect, admin, replyReview);

export default router;