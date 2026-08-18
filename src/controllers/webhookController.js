import { processarMercadoPago } from './webhooks/mercadoPagoWebhook.js';
import { processarStripe } from './webhooks/stripeWebhook.js';
import { processarAsaas } from './webhooks/asaasWebhook.js';
import { processarAbacate } from './webhooks/abacateWebhook.js';
import { processarCielo } from './webhooks/cieloWebhook.js';
import { processarMercadoLivreNotification } from './webhooks/mercadoLivreWebhook.js';
import { 
    handleMercadoPagoOAuthCallback as mpOAuth,
    handleMercadoLivreOAuthCallback as mlOAuth,
    handleStripeOAuthCallback as stripeOAuth,
    renovarTokenMercadoPago as renovarMP
} from './webhooks/oauthWebhooks.js';

// =========================================================================
// 🚀 HUB DE WEBHOOKS (Dispatcher)
// Centraliza as rotas para não quebrar o `webhookRoutes.js`
// =========================================================================

export const handleMercadoPagoWebhook = (req, res) => processarMercadoPago(req, res);
export const handleStripeWebhook = (req, res) => processarStripe(req, res);
export const handleAsaasWebhook = (req, res) => processarAsaas(req, res);
export const handleAbacateWebhook = (req, res) => processarAbacate(req, res);
export const handleCieloWebhook = (req, res) => processarCielo(req, res);
export const handleMercadoLivreNotification = (req, res) => processarMercadoLivreNotification(req, res);

// OAuth Callbacks
export const handleMercadoPagoOAuthCallback = (req, res) => mpOAuth(req, res);
export const handleMercadoLivreOAuthCallback = (req, res) => mlOAuth(req, res);
export const handleStripeOAuthCallback = (req, res) => stripeOAuth(req, res);
export const renovarTokenMercadoPago = (id_tenant) => renovarMP(id_tenant);