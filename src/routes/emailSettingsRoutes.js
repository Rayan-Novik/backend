import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
// 🟢 Importando a nossa catraca inteligente
import { requirePermission } from '../middlewares/permissionMiddleware.js';
import { 
    getEmailConfig, 
    updateEmailConfig, 
    testEmailConnection,
    getConfigByKey,
    triggerTestScenario,
} from '../controllers/emailSettingsController.js';

const router = express.Router();

// ==========================================
// ROTAS DE GESTÃO DO SMTP (Protegidas)
// ==========================================
router.get('/email', protect, requirePermission('CONFIG_EMAIL'), getEmailConfig);
router.put('/email', protect, requirePermission('CONFIG_EMAIL'), updateEmailConfig);

// Rotas de teste do SMTP
router.post('/email/test', protect, requirePermission('CONFIG_EMAIL'), testEmailConnection);
router.post('/email/test-scenario', protect, requirePermission('CONFIG_EMAIL'), triggerTestScenario);

// ==========================================
// ROTA INTERNA GERAL
// ==========================================
// Aberta para qualquer usuário logado (já estava assim no seu original)
router.get('/public/:key', protect, getConfigByKey);

export default router;