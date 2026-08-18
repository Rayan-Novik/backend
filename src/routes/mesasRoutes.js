import express from 'express';
import { listarMesas, criarMesa, atualizarMesa, excluirMesa } from '../controllers/vendaslocais/mesasController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { requirePermission } from '../middlewares/permissionMiddleware.js';

const router = express.Router();

router.get('/', protect, requirePermission('PDV_ACCESS'), listarMesas);
router.post('/', protect, requirePermission('CONFIG_UNIDADES'), criarMesa);
router.put('/:id', protect, requirePermission('CONFIG_UNIDADES'), atualizarMesa);
router.delete('/:id', protect, requirePermission('CONFIG_UNIDADES'), excluirMesa);

export default router;