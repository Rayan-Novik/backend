import express from 'express';
// Importe a função 'removerDoCarrinho' do controller
import { getCarrinho, addAoCarrinho, removerDoCarrinho } from '../controllers/carrinhoController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/', getCarrinho);
router.post('/', addAoCarrinho);

// Adicione esta nova rota de exclusão
router.delete('/:id_produto', removerDoCarrinho);

export default router;