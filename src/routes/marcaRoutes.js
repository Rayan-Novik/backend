import express from 'express';
const router = express.Router();
import {
    getAllMarcas,
    createMarca,
    updateMarca,
    deleteMarca
} from '../controllers/marcaController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';

// Rota para buscar a lista de marcas (usada nos formulários)
router.route('/').get(getAllMarcas);

// Rotas de admin para gerir as marcas
router.route('/').post(protect, admin, createMarca);
router.route('/:id')
    .put(protect, admin, updateMarca)
    .delete(protect, admin, deleteMarca);

export default router;
