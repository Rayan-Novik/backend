import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import { requirePermission } from '../middlewares/permissionMiddleware.js';
import { 
    listarImpressoras, 
    criarImpressora, 
    removerImpressora, 
    vincularCategoriaImpressora 
} from '../controllers/vendaslocais/impressoraController.js';

const router = express.Router();

// Todas as rotas de impressora precisam que o usuário esteja logado e tenha permissão de gerenciar a unidade
router.use(protect);
router.use(requirePermission('CONFIG_UNIDADES'));

router.get('/', listarImpressoras);
router.post('/', criarImpressora);
router.delete('/:id', removerImpressora);

// Rota híbrida para gerenciar a regra na tabela de categorias
router.put('/categorias/:id_categoria', vincularCategoriaImpressora);

export default router;