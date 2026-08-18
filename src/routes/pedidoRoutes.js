import express from 'express';
const router = express.Router();

import {
    criarPedido,
    getPedidoById,
    getMeusPedidos,
    getAllPedidos,
    updatePedidoParaEntregue,
    updatePedidoStatus,
    deletePedido,
    criarPreferenciaMP,
    confirmDeliveryByDriver,
    getDeliveryDataByToken,
    updateDriverLocation,
    getNovosPedidosCount,
    gerarPdfA4,              // 🟢 NOVA ROTA IMPORTADA
    imprimirTermicaCaixa     // 🟢 NOVA ROTA IMPORTADA
} from '../controllers/pedidoController.js';

import { protect } from '../middlewares/authMiddleware.js';
import { requirePermission } from '../middlewares/permissionMiddleware.js';

// ==========================================================
// 1. ROTAS PÚBLICAS DO MOTORISTA (NÃO EXIGEM LOGIN)
// Devem vir antes das rotas com :id para não dar erro de CastError
// ==========================================================
router.get('/driver-link/:token', getDeliveryDataByToken);
router.post('/driver-confirm', confirmDeliveryByDriver);
router.put('/driver-location/:token', updateDriverLocation); // Rota para receber o GPS

// ==========================================================
// 2. ROTAS DO CLIENTE LOGADO
// ==========================================================
router.post('/preference', protect, criarPreferenciaMP); // Gerar Preferência do Mercado Pago (Wallet)
router.get('/meus-pedidos', protect, getMeusPedidos);    // Exclusiva para o cliente buscar os seus próprios pedidos
router.post('/', protect, criarPedido);                  // Criar um novo pedido

// ==========================================================
// 3. ROTAS DA EQUIPE / ADMIN (PROTEGIDAS PELA CATRACA)
// ==========================================================
// Lista todos os pedidos da loja (Requer permissão de VISUALIZAR)
router.get('/', protect, requirePermission('PEDIDOS_VIEW'), getAllPedidos);

router.get('/novos/count', protect, requirePermission('PEDIDOS_VIEW'), getNovosPedidosCount);

// 🟢 NOVAS ROTAS DE IMPRESSÃO (Requer permissão de VISUALIZAR)
router.get('/:id/imprimir-a4', protect, requirePermission('PEDIDOS_VIEW'), gerarPdfA4);
router.post('/:id/imprimir-termica', protect, requirePermission('PEDIDOS_VIEW'), imprimirTermicaCaixa);

// Despachar/entregar ou alterar status (Requer permissão de GERENCIAR)
router.put('/:id/deliver', protect, requirePermission('PEDIDOS_MANAGE'), updatePedidoParaEntregue);
router.put('/:id/status', protect, requirePermission('PEDIDOS_MANAGE'), updatePedidoStatus);

// ==========================================================
// 4. ROTAS MISTAS E EXCLUSÃO
// ==========================================================
router.route('/:id')
    // Qualquer um logado pode acessar essa rota, MAS o controller (getPedidoById) 
    // deve bloquear se o pedido não for dele E ele não tiver permissão de admin.
    .get(protect, getPedidoById) 
    
    // Só quem tem acesso de gestão de pedidos pode apagar do sistema
    .delete(protect, requirePermission('PEDIDOS_MANAGE'), deletePedido);

export default router;