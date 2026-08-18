import express from 'express';
import { 
    createCupom, 
    getCupons, 
    validateCupom, 
    deleteCupom 
} from '../controllers/cupomController.js';
import { protect } from '../middlewares/authMiddleware.js';
// 🟢 Importando a nossa catraca inteligente no lugar do admin
import { requirePermission } from '../middlewares/permissionMiddleware.js';

const router = express.Router();

// Rota pública (ou protegida por user simples) para aplicar desconto no carrinho
router.post('/validar/:tenantId', validateCupom);

// ==========================================
// ROTAS PRIVADAS (Equipe de Marketing)
// ==========================================

router.route('/')
    // 🟢 Trocamos 'admin' pelas permissões fatiadas
    .post(protect, requirePermission('MARKETING_MANAGE'), createCupom) // Criar
    .get(protect, requirePermission('MARKETING_VIEW'), getCupons);     // Listar

router.route('/:id')
    .delete(protect, requirePermission('MARKETING_MANAGE'), deleteCupom); // Deletar

export default router;