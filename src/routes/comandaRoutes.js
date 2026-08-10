import express from 'express';
import {
    listarComandas,
    abrirComanda,
    adicionarItem,
    removerItem,
    fecharPagamentoComanda,
    juntarComandas,
    separarComanda,
    verificarCaixaLoja,
    solicitarFechamentoComanda,
    cancelarComanda,
    imprimirCozinha
} from '../controllers/vendaslocais/comandaController.js'; 

import { protect } from '../middlewares/authMiddleware.js';
import { requirePermission } from '../middlewares/permissionMiddleware.js';

const router = express.Router();

// ==========================================
// 🟢 ROTAS GERAIS E AÇÕES RÁPIDAS
// ==========================================
router.get('/', protect, requirePermission('PDV_ACCESS'), listarComandas);
router.post('/abrir', protect, requirePermission('PDV_ACCESS'), abrirComanda);
router.post('/juntar', protect, requirePermission('PDV_ACCESS'), juntarComandas);
router.post('/separar', protect, requirePermission('PDV_ACCESS'), separarComanda);
router.get('/status-caixa', protect, requirePermission('PDV_ACCESS'), verificarCaixaLoja);

// ==========================================
// 🟢 ROTAS ESPECÍFICAS DE UMA COMANDA (:id_pedido)
// ==========================================
router.delete('/:id_pedido', protect, requirePermission('PDV_ACCESS'), cancelarComanda);
router.post('/:id_pedido/solicitar-fechamento', protect, requirePermission('PDV_ACCESS'), solicitarFechamentoComanda);
router.post('/:id_pedido/fechar', protect, requirePermission('PDV_ACCESS'), fecharPagamentoComanda);
router.post('/:id_pedido/itens', protect, requirePermission('PDV_ACCESS'), adicionarItem);
router.delete('/:id_pedido/itens/:id_item', protect, requirePermission('PDV_ACCESS'), removerItem);
router.post('/:id_pedido/imprimir-cozinha', protect, requirePermission('PDV_ACCESS'), imprimirCozinha);

export default router;