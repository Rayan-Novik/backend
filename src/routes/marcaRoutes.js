import express from 'express';
const router = express.Router();
import {
    getAllMarcas,
    createMarca,
    updateMarca,
    deleteMarca
} from '../controllers/custom/marcaController.js';

import { protect } from '../middlewares/authMiddleware.js';
import { requirePermission } from '../middlewares/permissionMiddleware.js';

// Rota para buscar a lista de marcas (Pública para listar no formulário e E-commerce)
router.route('/').get(getAllMarcas);

// Rotas de admin para gerir as marcas (Requer gestão de produtos)
router.route('/')
    .post(protect, requirePermission('PRODUTOS_MANAGE'), createMarca);

router.route('/:id')
    .put(protect, requirePermission('PRODUTOS_MANAGE'), updateMarca)
    .delete(protect, requirePermission('PRODUTOS_MANAGE'), deleteMarca);

export default router;