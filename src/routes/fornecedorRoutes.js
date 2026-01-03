import express from 'express';
import { 
    createFornecedor, 
    getAllFornecedores, 
    updateFornecedor, 
    deleteFornecedor 
} from '../controllers/fornecedorController.js';

const router = express.Router();

// Rotas protegidas (Admin)
router.post('/', createFornecedor);
router.get('/', getAllFornecedores);
router.put('/:id', updateFornecedor);
router.delete('/:id', deleteFornecedor);

export default router;