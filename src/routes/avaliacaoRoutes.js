import express from 'express';
const router = express.Router();
import {
    getProductReviews,
    createProductReview,
    getAdminReviews,
    replyReview
} from '../controllers/avaliacaoController.js';

import { protect } from '../middlewares/authMiddleware.js';
// 🟢 Importando a catraca de permissões
import { requirePermission } from '../middlewares/permissionMiddleware.js';

// ==========================================================
// 🛒 ROTAS DE PRODUTO (Públicas / Cliente Final)
// ==========================================================

// Buscar avaliações de um produto (Livre para visitantes)
router.route('/:id/reviews').get(getProductReviews);

// Usuário logado cria avaliação
router.route('/:id/reviews').post(protect, createProductReview);


// ==========================================================
// 🛡️ ROTAS ADMIN (Gestão de Feedback)
// ==========================================================

// Listar todas as avaliações da loja (Requer permissão de Avaliações)
router.route('/admin/all')
    .get(protect, requirePermission('AVALIACOES_MANAGE'), getAdminReviews);

// Responder uma avaliação específica (Requer permissão de Avaliações)
router.route('/admin/:id/reply')
    .put(protect, requirePermission('AVALIACOES_MANAGE'), replyReview);

export default router;