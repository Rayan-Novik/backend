import express from 'express';
import { 
    getLojas, 
    getLojasAdmin, // ✅ Nova função para o admin ver tudo
    createLoja, 
    updateLoja,    // ✅ Nova função para editar/ativar/desativar
    deleteLoja 
} from '../controllers/lojaController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';

const router = express.Router();

// Rota Pública (Apenas lojas ativas para o cliente final)
router.get('/', getLojas); 

// --- Rotas Administrativas ---

// Buscar TODAS as lojas (ativas e inativas) para o painel
router.get('/admin', protect, admin, getLojasAdmin); 

// Criar loja
router.post('/', protect, admin, createLoja);

// Editar loja (Dados ou Status Ativo/Inativo)
router.put('/:id', protect, admin, updateLoja); 

// Deletar loja
router.delete('/:id', protect, admin, deleteLoja);

export default router;