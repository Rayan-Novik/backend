import express from 'express';
import {
    getAllCargos,
    createCargo,
    updateCargo,
    deleteCargo
} from '../controllers/users/cargoController.js';

import { protect } from '../middlewares/authMiddleware.js';
import { requirePermission } from '../middlewares/permissionMiddleware.js';

const router = express.Router();

// =================================================
// 🛡️ ROTAS DE GESTÃO DE CARGOS E PERMISSÕES
// =================================================

// 🟢 GET: Exige apenas EQUIPE_VIEW (Permite que o usuário veja a lista)
router.get('/', protect, requirePermission('EQUIPE_VIEW'), getAllCargos);

// 🔴 POST: Continua exigindo EQUIPE_MANAGE (Apenas gerentes/donos podem criar)
router.post('/', protect, requirePermission('EQUIPE_MANAGE'), createCargo);

// 🔴 PUT e DELETE: Exigem EQUIPE_MANAGE (Editar e Excluir)
router.route('/:id')
    .put(protect, requirePermission('EQUIPE_MANAGE'), updateCargo)
    .delete(protect, requirePermission('EQUIPE_MANAGE'), deleteCargo);

export default router;