import express from 'express';
import { 
    handleMercadoPagoWebhook, 
    handleMercadoLivreNotification,
    handleAbacateWebhook,
    handleStripeWebhook,
    handleAsaasWebhook,
    handleCieloWebhook,
    handleMercadoPagoOAuthCallback,
    handleMercadoLivreOAuthCallback,
    handleStripeOAuthCallback,
} from '../controllers/webhookController.js';

const router = express.Router();

router.get('/mercadopago/callback', handleMercadoPagoOAuthCallback);
router.get('/mercadolivre/callback', handleMercadoLivreOAuthCallback);
router.get('/stripe/callback', handleStripeOAuthCallback);
router.post('/mercadopago', handleMercadoPagoWebhook);
router.post('/mercadolivre', handleMercadoLivreNotification);
router.post('/abacatepay', handleAbacateWebhook);

router.post('/stripe', express.raw({type: 'application/json'}), handleStripeWebhook); 

router.post('/asaas', handleAsaasWebhook);

router.post('/cielo', handleCieloWebhook);

export default router;