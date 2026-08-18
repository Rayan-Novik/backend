import express from 'express';
const router = express.Router();
import {
    getFreteSettings,
    updateFreteSettings,
    calcularFrete
} from '../controllers/freteController.js';

import { protect } from '../middlewares/authMiddleware.js';
// 🟢 Importando a Catraca
import { requirePermission } from '../middlewares/permissionMiddleware.js';

// Agora, apenas utilizadores logados podem calcular o frete
router.post('/calcular', protect, calcularFrete);

// Rotas da equipe para gerir as configurações (Requer permissão de Envio)
router.route('/settings')
    .get(protect, requirePermission('CONFIG_ENVIO'), getFreteSettings)
    .put(protect, requirePermission('CONFIG_ENVIO'), updateFreteSettings);

export default router;