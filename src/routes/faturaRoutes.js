import express from 'express';
import { 
    gerarCobrancaSaaS, 
    webhookMercadoPago,
    getStatusAssinatura,
    getHistoricoFaturas 
} from '../controllers/faturaController.js'
import { protect } from '../middlewares/authMiddleware.js';
// 🟢 Importando a catraca inteligente
import { requirePermission } from '../middlewares/permissionMiddleware.js';

const router = express.Router();

// ==========================================
// ROTAS DE VISUALIZAÇÃO (Liberadas para a equipe)
// ==========================================
router.get('/status', protect, getStatusAssinatura);
router.get('/historico', protect, getHistoricoFaturas);

// ==========================================
// ROTAS DE AÇÃO (Protegidas)
// ==========================================
// Apenas quem gerencia as contas a pagar da loja pode gerar novas faturas do SaaS
router.post('/gerar', protect, requirePermission('CONTAS_MANAGE'), gerarCobrancaSaaS);

// ==========================================
// WEBHOOK DO MERCADO PAGO
// ==========================================
// NÃO USA AUTH POIS É O MP QUEM CHAMA PARA CONFIRMAR O PAGAMENTO
router.post('/webhook', webhookMercadoPago);

export default router;