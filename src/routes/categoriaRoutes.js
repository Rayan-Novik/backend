import express from 'express';
const router = express.Router();
import { 
    getAllCategorias, 
    createCategoria, 
    deleteCategoria,
    updateCategoria,
    createSubcategoria,
    deleteSubcategoria,
    updateSubcategoria
} from '../controllers/categoriaController.js';

import { protect } from '../middlewares/authMiddleware.js';
// 🟢 Substituindo o admin antigo pela catraca nova
import { requirePermission } from '../middlewares/permissionMiddleware.js'; 

// ------------------- ROTAS DE CATEGORIA -------------------

// Rota pública para ver categorias + subcategorias (Usada no E-commerce e no Painel)
router.route('/').get(getAllCategorias);

// Criar, Editar e Deletar Categoria Pai (Exige PRODUTOS_MANAGE)
router.post('/', protect, requirePermission('PRODUTOS_MANAGE'), createCategoria);
router.put('/:id', protect, requirePermission('PRODUTOS_MANAGE'), updateCategoria);
router.delete('/:id', protect, requirePermission('PRODUTOS_MANAGE'), deleteCategoria);


// ------------------- ROTAS DE SUBCATEGORIA -------------------

// Criar, Editar e Deletar Subcategoria (Exige PRODUTOS_MANAGE)
router.post('/sub', protect, requirePermission('PRODUTOS_MANAGE'), createSubcategoria);
router.put('/sub/:id', protect, requirePermission('PRODUTOS_MANAGE'), updateSubcategoria);
router.delete('/sub/:id', protect, requirePermission('PRODUTOS_MANAGE'), deleteSubcategoria);

export default router;