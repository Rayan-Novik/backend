import express from 'express';
import { 
    getAutomation, 
    saveAutomation, 
    testAutomation 
} from '../controllers/AutomationController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';

const router = express.Router();

// Rota de Teste (POST) - Deve vir antes das rotas com parâmetros dinâmicos
router.post('/test', protect, admin, testAutomation);

// Rotas de Leitura e Escrita (usando :type como parametro)
// Ex: /api/automation/abandoned_cart
router.route('/:type')
    .get(protect, admin, getAutomation)
    .put(protect, admin, saveAutomation);

export default router;