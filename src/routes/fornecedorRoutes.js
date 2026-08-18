import express from 'express';
import { 
    createFornecedor, 
    getAllFornecedores, 
    updateFornecedor, 
    deleteFornecedor 
} from '../controllers/fornecedorController.js';

// 🟢 1. Importando a nossa segurança e a catraca
import { protect } from '../middlewares/authMiddleware.js';
import { requirePermission } from '../middlewares/permissionMiddleware.js';

const router = express.Router();

// ============================================================================
// 🟢 ROTAS DA EQUIPE (PROTEGIDAS)
// Exigem que o usuário esteja logado (protect) e tenha gestão de estoque
// ============================================================================

router.post('/', protect, requirePermission('ESTOQUE_MANAGE'), createFornecedor);
router.get('/', protect, requirePermission('ESTOQUE_MANAGE'), getAllFornecedores);
router.put('/:id', protect, requirePermission('ESTOQUE_MANAGE'), updateFornecedor);
router.delete('/:id', protect, requirePermission('ESTOQUE_MANAGE'), deleteFornecedor);

export default router;