import express from 'express';
import { 
    getPaymentGatewaySettings, 
    updatePaymentGatewaySettings,
    getMercadoPagoPublicKey // ✅ 1. Importa a nova função
} from '../controllers/paymentGatewayController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';

const router = express.Router();

// ✅ 2. Adiciona a nova rota PÚBLICA para a chave do Mercado Pago.
// Esta rota não usa 'protect', pois precisa de ser acessível pela sua loja.
router.get('/mercadopago-public-key', getMercadoPagoPublicKey);

// Rotas protegidas para o painel de administração (já existentes)
router.route('/')
    .get(protect, admin, getPaymentGatewaySettings)
    .put(protect, admin, updatePaymentGatewaySettings);

export default router;

