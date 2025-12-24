import express from 'express';
const router = express.Router();
import {
    getAppearanceSettings,
    updateAppearanceSettings,
    getPublicConfiguracoes,
} from '../controllers/configuracaoController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';

// Rota para buscar as configurações de aparência.
// A rota para buscar é pública, para que o seu e-commerce possa aceder.
router.get('/appearance', getAppearanceSettings);

// Esta rota não precisa de "protect" ou "admin" porque é para o e-commerce
router.route('/public').get(getPublicConfiguracoes);

// Rota para atualizar as configurações de aparência.
// Apenas administradores podem fazer isto.
router.put('/appearance', protect, admin, updateAppearanceSettings);

export default router;
