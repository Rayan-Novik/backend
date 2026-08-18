import express from 'express';
// ✅ 1. ADICIONE 'atualizarQuantidade' NA IMPORTAÇÃO
import { 
    getCarrinho, 
    addAoCarrinho, 
    removerDoCarrinho, 
    atualizarQuantidade 
} from '../controllers/carrinhoController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Aplica proteção a todas as rotas abaixo
router.use(protect);

router.get('/', getCarrinho);
router.post('/', addAoCarrinho);

router.put('/update', atualizarQuantidade);
router.delete('/:id_produto', removerDoCarrinho);

export default router;