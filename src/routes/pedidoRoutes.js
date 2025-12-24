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
} from '../controllers/pedidoController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';

// --- ROTAS ESPECÍFICAS (DEVEM VIR PRIMEIRO) ---

// GET /api/pedidos/meuspedidos -> Rota exclusiva para o cliente buscar os seus próprios pedidos.
// Como é a mais específica, colocamo-la no topo para garantir que é encontrada primeiro.
router.get('/meuspedidos', protect, getMeusPedidos);


// --- ROTAS DE ADMIN (QUE USAM A RAIZ OU PARÂMETROS) ---

// GET /api/pedidos -> Rota para o admin buscar TODOS os pedidos.
router.get('/', protect, admin, getAllPedidos);

// PUT /api/pedidos/:id/deliver -> Rota para o admin marcar um pedido como entregue.
router.put('/:id/deliver', protect, admin, updatePedidoParaEntregue);
router.route('/:id/status').put(protect, admin, updatePedidoStatus);


// --- ROTAS GERAIS (QUE SE APLICAM A CLIENTES E ADMINS) ---

// POST /api/pedidos -> Rota para um cliente criar um novo pedido.
router.post('/', protect, criarPedido);

// GET /api/pedidos/:id -> Rota para buscar um pedido específico por ID.
// A lógica no controller 'getPedidoById' já verifica se o utilizador é o dono ou um admin.
// DELETE /api/pedidos/:id -> Rota para um admin apagar um pedido.
router.route('/:id')
    .get(protect, getPedidoById) // Correto!
    .delete(protect, admin, deletePedido);

export default router;
