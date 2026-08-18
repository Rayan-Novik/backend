import express from 'express';
import { 
    registerTenant, 
    getDominioLoja, 
    updateDominioLoja,
    getAllTenants, 
    deleteTenant,
    getAllPlanos,
    createPlano,
    updatePlano,
    deletePlano,
    getPlanosPublicos,
    getTenantContactInfo,
    updateTenantInfo,
    renovarAssinaturaManual,
} from '../controllers/tenantController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';
import { requirePermission } from '../middlewares/permissionMiddleware.js';

const router = express.Router();

// Rota pública (não precisa de token) para criar a loja
router.post('/register', registerTenant);

router.get('/info', protect, getTenantContactInfo);
router.put('/info', protect, requirePermission('CONFIG_UNIDADES'), updateTenantInfo);

// Rotas protegidas para gerenciar o domínio personalizado
router.get('/dominio', protect, admin, getDominioLoja);
router.put('/dominio', protect, admin, updateDominioLoja);

router.get('/saas', protect, admin, getAllTenants);
router.delete('/saas/:id', protect, admin, deleteTenant);

router.get('/saas/planos', protect, admin, getAllPlanos);
router.post('/saas/planos', protect, admin, createPlano);
router.put('/saas/planos/:id', protect, admin, updatePlano);
router.delete('/saas/planos/:id', protect, admin, deletePlano);
router.get('/planos-publicos', getPlanosPublicos);
router.post('/saas/:id/renovar', protect, admin, renovarAssinaturaManual);

export default router;