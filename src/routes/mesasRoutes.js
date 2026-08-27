import express from 'express';
import { listarMesas, criarMesa, atualizarMesa, excluirMesa, obterQrCodeMesa } from '../controllers/vendaslocais/mesasController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { requirePermission } from '../middlewares/permissionMiddleware.js';

const router = express.Router();

router.get('/', protect, requirePermission('PDV_ACCESS'), listarMesas);
router.post('/', protect, requirePermission('CONFIG_UNIDADES'), criarMesa);
router.put('/:id', protect, requirePermission('CONFIG_UNIDADES'), atualizarMesa);
router.delete('/:id', protect, requirePermission('CONFIG_UNIDADES'), excluirMesa);

router.get('/:id/qrcode', protect, requirePermission('PDV_ACCESS'), obterQrCodeMesa);

export default router;