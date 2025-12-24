import express from 'express';
import { handleMercadoPagoWebhook, handleMercadoLivreNotification } from '../controllers/webhookController.js';

const router = express.Router();

// Webhooks NÃO devem ter autenticação
router.post('/mercadopago', handleMercadoPagoWebhook);

router.post('/mercadolivre', handleMercadoLivreNotification);

export default router;