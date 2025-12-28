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

const router = express.Router();

// Rotas existentes
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



export default router;