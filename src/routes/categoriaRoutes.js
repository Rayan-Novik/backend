import express from 'express';
const router = express.Router();
import { 
    getAllCategorias, 
    createCategoria, 
    deleteCategoria,
    updateCategoria, // <--- Importado
    createSubcategoria,
    deleteSubcategoria,
    updateSubcategoria // <--- Importado
} from '../controllers/categoriaController.js';

import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js'; 

// ------------------- ROTAS DE CATEGORIA -------------------

// Rota pública para ver categorias + subcategorias
router.route('/').get(getAllCategorias);

// Apenas Admin: Criar, Editar e Deletar Categoria Pai
router.post('/', protect, admin, createCategoria);
router.put('/:id', protect, admin, updateCategoria); // <--- Rota de Edição
router.delete('/:id', protect, admin, deleteCategoria);


// ------------------- ROTAS DE SUBCATEGORIA -------------------

// Criar uma subcategoria (Envia { "nome": "X", "id_categoria": 1 })
router.post('/sub', protect, admin, createSubcategoria);

// Editar uma subcategoria (Nome ou mudar de Pai)
router.put('/sub/:id', protect, admin, updateSubcategoria); // <--- Rota de Edição

// Deletar uma subcategoria pelo ID dela
router.delete('/sub/:id', protect, admin, deleteSubcategoria);

export default router;