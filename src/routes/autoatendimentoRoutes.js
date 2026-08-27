import express from 'express';
import {
    listarProdutosAutoatendimento,
    verComandaMesa,
    enviarPedidoMesa,
    gerarPixMesa
} from '../controllers/vendaslocais/autoatendimentoController.js';

const router = express.Router();

// 🟢 Rotas ajustadas para corresponder exatamente ao padrão /m/:token que o frontend chama
router.get('/produtos', listarProdutosAutoatendimento);
router.get('/m/:token', verComandaMesa);
router.post('/m/:token/pedir', enviarPedidoMesa);
router.post('/m/:token/pagar-pix', gerarPixMesa);

export default router;