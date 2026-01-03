import express from 'express';
const router = express.Router();
import {
    getAppearanceSettings,
    updateAppearanceSettings,
    getPublicConfiguracoes,
    getPixDiscountConfig,    // <--- Importar
    updatePixDiscountConfig,  // <--- Importar
    getHomepageLayout,
    updateHomepageLayout
} from '../controllers/configuracaoController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';

// Rota para buscar as configurações de aparência.
router.get('/appearance', getAppearanceSettings);

// Rota pública
router.route('/public').get(getPublicConfiguracoes);

// Rota para atualizar as configurações de aparência (Admin)
router.put('/appearance', protect, admin, updateAppearanceSettings);

// ✅ NOVA ROTA: Configurações de Desconto Pix
router.route('/pix-desconto')
    .get(getPixDiscountConfig) // Frontend público pode ler para mostrar "5% OFF no Pix"
    .post(protect, admin, updatePixDiscountConfig); // Só admin altera

router.route('/homepage-layout')
    .get(getHomepageLayout)
    .post(protect, admin, updateHomepageLayout);   
export default router;