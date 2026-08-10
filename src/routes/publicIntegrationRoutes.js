import express from 'express';
import { apiKeyAuth, requirePermission } from '../middlewares/apiKeyAuth.js'; 
import {
    getProdutosPublicos,
    gerenciarClientePublico,
    cadastrarEnderecoPublico,
    calcularFretePublico,
    gerarPedidoPublico
} from '../controllers/api/publicIntegrationController.js';

const router = express.Router();

// 🚀 Protege TUDO daqui pra baixo
router.use(apiKeyAuth);

// Consultar o catálogo
router.get('/produtos', requirePermission('READ_PRODUTOS'), getProdutosPublicos);

// Identificar cliente
router.post('/clientes/identificar', requirePermission('WRITE_CLIENTES'), gerenciarClientePublico);

// Cadastrar endereço
router.post('/clientes/enderecos', requirePermission('WRITE_CLIENTES'), cadastrarEnderecoPublico);

// Consultar fretes
router.post('/frete/calcular', requirePermission('READ_PRODUTOS'), calcularFretePublico);

// Gerar o pedido oficial (Gera PIX/Link)
router.post('/pedidos', requirePermission('WRITE_PEDIDOS'), gerarPedidoPublico);

export default router;