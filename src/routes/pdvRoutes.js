import express from 'express';
import { 
    getStatusCaixa, 
    abrirCaixa, 
    fecharCaixa, 
    adicionarMovimentacao, 
    registrarVendaPDV,     
    getHistoricoVendas,
    getRelatorioFechamento,
    conferirFechamento,
    getHistoricoCaixas,
    receberSaldoPendente, // 🟢 NOVA FUNÇÃO IMPORTADA AQUI
    gerarPdfA4,           // 🟢 Rota de Impressão A4
    imprimirTermicaCaixa  // 🟢 Rota de Impressão Térmica
} from '../controllers/vendaslocais/pdvController.js';

import { protect } from '../middlewares/authMiddleware.js';
// 🟢 Importando a nossa catraca inteligente
import { requirePermission } from '../middlewares/permissionMiddleware.js';

const router = express.Router();

// --- ACESSOS GERAIS DO OPERADOR (Quem tem PDV_ACCESS pode fazer) ---
// Usamos requirePermission('PDV_ACCESS') para garantir que o cara tem o cargo certo
router.get('/status', protect, requirePermission('PDV_ACCESS'), getStatusCaixa);
router.post('/abrir', protect, requirePermission('PDV_ACCESS'), abrirCaixa);
router.post('/fechar', protect, requirePermission('PDV_ACCESS'), fecharCaixa);
router.post('/venda', protect, requirePermission('PDV_ACCESS'), registrarVendaPDV);
router.get('/vendas', protect, requirePermission('PDV_ACCESS'), getHistoricoVendas);

// 🟢 NOVA ROTA: RECEBER RESTANTE DO PEDIDO NO BALCÃO (Sinal Online + Restante Local)
router.post('/receber-restante/:id_pedido', protect, requirePermission('PDV_ACCESS'), receberSaldoPendente);

// 🖨️ ROTAS DE IMPRESSÃO
router.get('/imprimir/a4/:id', protect, requirePermission('PDV_ACCESS'), gerarPdfA4);
router.post('/imprimir/termica/:id', protect, requirePermission('PDV_ACCESS'), imprimirTermicaCaixa);


// --- ACESSOS FINANCEIROS (Ações sensíveis no caixa) ---

// Sangria e Suprimento exigem permissão de gestão financeira
router.post('/movimentacao', protect, requirePermission('FINANCEIRO_MANAGE'), adicionarMovimentacao);

// Conferência de fechamento e relatórios exigem visualização financeira
router.post('/conferir', protect, requirePermission('FINANCEIRO_VIEW'), conferirFechamento);
router.get('/historico-caixas', protect, requirePermission('FINANCEIRO_VIEW'), getHistoricoCaixas);
router.get('/relatorio/:id_caixa', protect, requirePermission('FINANCEIRO_VIEW'), getRelatorioFechamento);

export default router;