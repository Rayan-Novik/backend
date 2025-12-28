import express from 'express';
import { 
    createCupom, 
    getCupons, 
    validateCupom, 
    deleteCupom 
} from '../controllers/cupomController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';

const router = express.Router();

// Rota pública (ou protegida por user simples) para aplicar desconto no carrinho
router.post('/validar', validateCupom);

// Rotas Administrativas
router.route('/')
    .post(protect, admin, createCupom) // Criar
    .get(protect, admin, getCupons);   // Listar

router.route('/:id')
    .delete(protect, admin, deleteCupom); // Deletar

export default router;