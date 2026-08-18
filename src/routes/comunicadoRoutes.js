import express from 'express';
const router = express.Router();
import {
    getActiveComunicado,
    getAllComunicados,
    createComunicado,
    updateComunicado,
    deleteComunicado
} from '../controllers/custom/comunicadoController.js';

import { protect } from '../middlewares/authMiddleware.js';
// 🟢 Importando a nossa catraca inteligente em vez do 'admin' cego
import { requirePermission } from '../middlewares/permissionMiddleware.js';

// Rota pública para a vitrine exibir o pop-up (Não mexe, já está certa!)
router.get('/active/:tenantId', getActiveComunicado);

// ==========================================================
// ROTAS PROTEGIDAS DA EQUIPE DE MARKETING
// ==========================================================

router.route('/')
    // 🟢 Trocamos o 'admin' por requirePermission
    .get(protect, requirePermission('MARKETING_VIEW'), getAllComunicados)
    .post(protect, requirePermission('MARKETING_MANAGE'), createComunicado);

router.route('/:id')
    // 🟢 Trocamos o 'admin' por requirePermission
    .put(protect, requirePermission('MARKETING_MANAGE'), updateComunicado)
    .delete(protect, requirePermission('MARKETING_MANAGE'), deleteComunicado);

export default router;