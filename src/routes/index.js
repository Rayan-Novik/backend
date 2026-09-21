import express from 'express';
import produtoRoutes from './produtoRoutes.js';
import usuarioRoutes from './usuarioRoutes.js';
import enderecoRoutes from './enderecoRoutes.js';
import pedidoRoutes from './pedidoRoutes.js';
import webhookRoutes from './webhookRoutes.js';
import carrinhoRoutes from './carrinhoRoutes.js';
import dashboardRoutes from './dashboardRoutes.js';
import categoriaRoutes from './categoriaRoutes.js';
import carrosselRoutes from './carrosselRoutes.js';
import destaquesRoutes from './destaquesRoutes.js';
import marcaRoutes from './marcaRoutes.js';
import configuracaoRoutes from './configuracaoRoutes.js';
import uploadRoutes from './uploadRoutes.js';
import bannerRoutes from './bannerRoutes.js';
import relatorioRoutes from './relatorioRoutes.js';
import freteRoutes from './freteRoutes.js';
import avaliacaoRoutes from './avaliacaoRoutes.js';
import comunicadoRoutes from './comunicadoRoutes.js';
import apiKeysRoutes from './apiKeysRoutes.js';
import wishlistRoutes from './wishlistRoutes.js';
import socialMediaRoutes from './socialMediaRoutes.js'
import mercadoLivreRoutes from './mercadoLivreRoutes.js';
import botRoutes from './botRoutes.js';
import uploadImagesRoutes from './uploadImagesRoutes.js';
import integrationRoutes from './integrationRoutes.js'
import paymentGatewayRoutes from './paymentGatewayRoutes.js'
import imageGeneratorRoutes from './imageGeneratorRoutes.js';
import heroBannerRoutes from './heroBannerRoutes.js'
import lojaRoutes from './lojaRoutes.js';
import cupomRoutes from './cupomRoutes.js';
import footerRoutes from './footerRoutes.js';
import emailSettingsRoutes from './emailSettingsRoutes.js';
import marketingRoutes from './marketingRoutes.js';
import publicRoutes from './publicRoutes.js';
import fornecedorRoutes from './fornecedorRoutes.js';
import automationRoutes from './automationRoutes.js';
import pdvRoutes from './pdvRoutes.js';
import financialRoutes from './financialRoutes.js';
import { getPaymentConfig } from '../controllers/configuracaoController.js';
import whatsappRoutes from './whatsappRoutes.js';
import tenantRoutes from './tenantRoutes.js';
import faturaRoutes from './faturaRoutes.js';
import sitemapRoutes from './sitemapRoutes.js';
import { renderOgTags } from '../controllers/ogController.js';
import cargoRoutes from './cargoRoutes.js';
import ifoodRoutes from './ifoodRoutes.js';
import publicApiRoutes from './apiKeysRoutes.js';
import publicIntegrationRoutes from './publicIntegrationRoutes.js';
import agendamentoRoutes from './agendamentoRoutes.js';
import modulosRoutes from './modulosRoutes.js';
import kanbanRoutes from './kanbanRoutes.js';
// 🟢 NOVOS IMPORTS: Comandas e Mesas
import comandaRoutes from './comandaRoutes.js';
import autoatendimentoRoutes from './autoatendimentoRoutes.js';
import mesasRoutes from './mesasRoutes.js';
import whazingConfigRoutes from './whazingConfigRoutes.js';

// 🟢 NOVO IMPORT: Impressoras
import impressoraRoutes from './impressoraRoutes.js';

import fiscalRoutes from './fiscalRoutes.js';

const router = express.Router();

router.get('/', (req, res) => {
    res.json({ message: "API Gateway Online" });
});

router.use('/produtos', produtoRoutes);
router.use('/usuarios', usuarioRoutes);
router.use('/enderecos', enderecoRoutes);
router.use('/pedidos', pedidoRoutes);
router.use('/meuspedidos', pedidoRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/carrinho', carrinhoRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/categorias', categoriaRoutes);
router.use('/carrossel', carrosselRoutes);
router.use('/destaques', destaquesRoutes);
router.use('/marcas', marcaRoutes);
router.use('/configuracoes', configuracaoRoutes);
router.use('/upload', uploadRoutes);
router.use('/uploadimages', uploadImagesRoutes);
router.use('/banners', bannerRoutes);
router.use('/relatorios', relatorioRoutes);
router.use('/frete', freteRoutes);
router.use('/lojas', lojaRoutes);
router.use('/comunicados', comunicadoRoutes);
router.use('/bot', botRoutes);
router.use('/apikeys', apiKeysRoutes);
router.use('/mercadolivre', mercadoLivreRoutes);
router.use('/produtos', avaliacaoRoutes);
router.use('/images', imageGeneratorRoutes);
router.use('/social-media', socialMediaRoutes);
router.use('/wishlist', wishlistRoutes);
router.use('/payment-gateways', paymentGatewayRoutes);
router.use('/hero-banner', heroBannerRoutes);
router.use('/integracao', integrationRoutes);
router.use('/cupons', cupomRoutes);
router.use('/footer', footerRoutes);
router.use('/config', emailSettingsRoutes);
router.use('/marketing', marketingRoutes);
router.use('/public', publicRoutes);
router.use('/fornecedores', fornecedorRoutes);
router.use('/automation', automationRoutes);
router.use('/admin', financialRoutes);
router.use('/admin/financial', financialRoutes);
router.use('/admin/modulos', modulosRoutes);
router.use('/pdv', pdvRoutes);

// 🟢 NOVAS ROTAS REGISTRADAS AQUI:
router.use('/comandas', comandaRoutes);
router.use('/mesas', mesasRoutes);
router.use('/autoatendimento', autoatendimentoRoutes);
router.use('/impressoras', impressoraRoutes);
router.use('/fiscal', fiscalRoutes);

router.get('/public-keys', getPaymentConfig);
router.use('/whatsapp', whatsappRoutes);
router.use('/tenants', tenantRoutes);
router.use('/fatura', faturaRoutes);
router.use('/sitemap.xml', sitemapRoutes);
router.use('/cargos', cargoRoutes);
router.use('/ifood', ifoodRoutes);
router.use('/agendamentos', agendamentoRoutes);
router.use('/kanban', kanbanRoutes);

// 🟢 ROTA DA CONFIGURAÇÃO DO WHAZING/KANBAN
router.use('/whazing-config', whazingConfigRoutes);

// ============================================================================
// 🚀 ROTA DA API PÚBLICA EXTERNA (Acessada via x-api-key)
// ============================================================================
router.use('/v1', publicApiRoutes);
router.use('/v2', publicIntegrationRoutes);

router.get('/public/render-og', renderOgTags);

router.get('/robots.txt', (req, res) => {
    res.type('text/plain');
    res.send("User-agent: *\nDisallow: /");
});

export default router;