import express from 'express';
import {
    getSocialMediaSettings,
    updateSocialMediaSettings,
    getWhatsAppConfig
} from '../controllers/socialMediaController.js';

import { protect } from '../middlewares/authMiddleware.js';
// 🟢 Importando a nossa catraca inteligente
import { requirePermission } from '../middlewares/permissionMiddleware.js';

const router = express.Router();

// ==========================================
// 🔓 ROTAS PÚBLICAS (Para a Vitrine)
// ==========================================
// Qualquer um (cliente ou visitante) pode buscar os links das redes sociais
router.get('/', getSocialMediaSettings);

// Rota pública para o botão do WhatsApp na loja
router.get('/whatsapp-config', getWhatsAppConfig);

// ==========================================
// 🛡️ ROTAS DE GESTÃO (Equipe de Marketing)
// ==========================================
// Apenas quem tem permissão de Marketing pode ATUALIZAR os links e configs
router.put('/', protect, requirePermission('CONFIG_APARENCIA'), updateSocialMediaSettings);

export default router;