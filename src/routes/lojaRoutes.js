import express from 'express';
import { 
    getLojas, 
    getLojasAdmin, 
    createLoja, 
    updateLoja,    
    deleteLoja 
} from '../controllers/lojaController.js';

import { protect } from '../middlewares/authMiddleware.js';
// 🟢 Importando a nossa catraca inteligente!
import { requirePermission } from '../middlewares/permissionMiddleware.js';

const router = express.Router();

// ==========================================================
// 🔓 ROTA PÚBLICA (Para o E-commerce)
// ==========================================================
// Lista apenas as lojas ativas para o cliente final encontrar a unidade
router.get('/', getLojas); 

// ==========================================================
// 🛡️ ROTAS ADMINISTRATIVAS (Protegidas por Permissão)
// ==========================================================

// Buscar TODAS as lojas (ativas e inativas) para o painel admin
router.get('/admin', protect, requirePermission('CONFIG_UNIDADES'), getLojasAdmin); 

// Criar nova loja física (Suporta horários de funcionamento)
router.post('/', protect, requirePermission('CONFIG_UNIDADES'), createLoja);

// Editar dados, status e horários de uma unidade existente
router.put('/:id', protect, requirePermission('CONFIG_UNIDADES'), updateLoja); 

// Remover permanentemente uma unidade do sistema
router.delete('/:id', protect, requirePermission('CONFIG_UNIDADES'), deleteLoja);

export default router;