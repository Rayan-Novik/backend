import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
// 🟢 Importando a nossa catraca inteligente! ADEUS ADMIN!
import { requirePermission } from '../middlewares/permissionMiddleware.js';
import {
    getDashboardFinanceiro,
    getRelatorioTransacoes,
    listarContasPagar,
    criarContaPagar,
    baixarContaPagar,
    listarContasReceber,
    baixarContaReceber,
    listarCategorias,
    criarCategoria,
    getContaPagarById,
    getContaReceberById,
    getDRE,
} from '../controllers/financialController.js';

const router = express.Router();

// ============================================================
// 📊 1. DASHBOARD & RELATÓRIOS (Requer Auditoria Financeira)
// ============================================================

// Fluxo de caixa, resumo de entradas/saídas e previsões
router.get('/dashboard', protect, requirePermission('FINANCEIRO_VIEW'), getDashboardFinanceiro);

// Relatório detalhado de transações (Gateway/PDV)
router.get('/transactions', protect, requirePermission('FINANCEIRO_VIEW'), getRelatorioTransacoes);

// Rota de compatibilidade
router.get('/financeiro', protect, requirePermission('FINANCEIRO_VIEW'), getRelatorioTransacoes); 

router.get('/dre', protect, requirePermission('FINANCEIRO_VIEW'), getDRE);


// ============================================================
// 💸 2. CONTAS A PAGAR (Requer Gestão de Contas)
// ============================================================

router.get('/payables', protect, requirePermission('CONTAS_MANAGE'), listarContasPagar);
router.get('/payables/:id', protect, requirePermission('CONTAS_MANAGE'), getContaPagarById);
router.post('/payables', protect, requirePermission('CONTAS_MANAGE'), criarContaPagar);
router.post('/payables/:id/pay', protect, requirePermission('CONTAS_MANAGE'), baixarContaPagar);


// ============================================================
// 💰 3. CONTAS A RECEBER (Requer Gestão de Contas)
// ============================================================

router.get('/receivables', protect, requirePermission('CONTAS_MANAGE'), listarContasReceber);
router.get('/receivables/:id', protect, requirePermission('CONTAS_MANAGE'), getContaReceberById);
router.post('/receivables/:id/receive', protect, requirePermission('CONTAS_MANAGE'), baixarContaReceber);


// ============================================================
// 🏷️ 4. CATEGORIAS FINANCEIRAS (Requer Gestão de Contas)
// ============================================================

router.get('/categories', protect, requirePermission('CONTAS_MANAGE'), listarCategorias);
router.post('/categories', protect, requirePermission('CONTAS_MANAGE'), criarCategoria);

export default router;