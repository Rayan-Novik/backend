import express from 'express';
import {
    getSocialMediaSettings,
    updateSocialMediaSettings,
    getWhatsAppConfig
} from '../controllers/socialMediaController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';

const router = express.Router();

// ✅ ROTA PÚBLICA: Qualquer um pode buscar os links das redes sociais.
// Removidos os middlewares 'protect' e 'admin'.
router.get('/', getSocialMediaSettings);

// ✅ ROTA DE ADMIN: Apenas admins podem ATUALIZAR os links.
// Mantidos os middlewares 'protect' e 'admin'.
router.put('/', protect, admin, updateSocialMediaSettings);

// Rota pública para o botão do WhatsApp (já estava correta)
router.get('/whatsapp-config', getWhatsAppConfig);

export default router;