import express from 'express';
import multer from 'multer';

// Middlewares
import { protect } from '../middlewares/authMiddleware.js';
import { injectFiscalTenant } from '../modules/fiscal/shared/tenantHelper.js';

// Controllers Nativos de Configuração e Operações do Pedido/XML
import {
    getConfiguracaoFiscal,
    upsertConfiguracaoFiscal,
    lerDadosCertificado,
    testarConexaoSefaz
} from '../controllers/fiscal/configuracaoFiscalController.js';

import {
    listarNotasSaida,
    gerarRascunhoSaida,
    emitirNotaSaida,
    importarXmlEntrada,
    confirmarXmlEntrada
} from '../controllers/fiscal/operacoesFiscaisController.js';

// Routers Nativos do Motor Fiscal Integrado
import { empresasRouter } from '../modules/fiscal/empresas/empresas.routes.js';
import { estabelecimentosRouter } from '../modules/fiscal/estabelecimentos/estabelecimentos.routes.js';
import { certificadosRouter } from '../modules/fiscal/certificados/certificados.routes.js';
import { seriesRouter } from '../modules/fiscal/series-numeracao/series.routes.js';
import { tabelasRouter } from '../modules/fiscal/tabelas-fiscais/tabelas.routes.js';
import { regrasRouter } from '../modules/fiscal/regras-tributarias/regras.routes.js';
import { produtosRouter } from '../modules/fiscal/produtos-fiscais/produtos.routes.js';
import { destinatariosRouter } from '../modules/fiscal/destinatarios/destinatarios.routes.js';
import { formasPagamentoRouter } from '../modules/fiscal/formas-pagamento/formas-pagamento.routes.js';
import { cenariosRouter } from '../modules/fiscal/cenarios-fiscais/cenarios.routes.js';
import { notasRouter } from '../modules/fiscal/notas/notas.routes.js';
import { eventosRouter } from '../modules/fiscal/notas/eventos.routes.js';
import { webhooksRouter } from '../modules/fiscal/webhooks/webhooks.routes.js';
import { tokensRouter } from '../modules/fiscal/tokens/tokens.routes.js';

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

// Aplica autenticação e injeção de tenant fiscal em todas as rotas
router.use(protect, injectFiscalTenant);

// ==========================================
// 🏢 EMPRESAS E CONFIGURAÇÕES FISCAIS
// ==========================================
// Rota de Configuração Geral (usada pelo PDV e telas de configuração)
router.get('/config', getConfiguracaoFiscal);
router.post('/config', upload.single('certificado'), upsertConfiguracaoFiscal);
router.put('/config', upload.single('certificado'), upsertConfiguracaoFiscal);
router.put('/config/:id', upload.single('certificado'), (req, res, next) => {
    if (req.params.id) req.body.id = req.params.id;
    next();
}, upsertConfiguracaoFiscal);

router.get('/configuracao', getConfiguracaoFiscal);
router.post('/configuracao', upload.single('certificado'), upsertConfiguracaoFiscal);
router.put('/configuracao', upload.single('certificado'), upsertConfiguracaoFiscal);

router.get('/configuracoes', getConfiguracaoFiscal);
router.post('/configuracoes', upload.single('certificado'), upsertConfiguracaoFiscal);
router.put('/configuracoes', upload.single('certificado'), upsertConfiguracaoFiscal);

// Rotas de Empresa
router.get('/empresas', getConfiguracaoFiscal);
router.post('/empresas', upload.single('certificado'), upsertConfiguracaoFiscal);
router.put('/empresas/:id', upload.single('certificado'), (req, res, next) => {
    if (req.params.id) req.body.id = req.params.id;
    next();
}, upsertConfiguracaoFiscal);
router.use('/empresas-crud', empresasRouter);

// Ferramentas do Certificado e Teste SEFAZ
router.post('/configuracao/ler-certificado', upload.single('certificado'), lerDadosCertificado);
router.get('/testar-sefaz', testarConexaoSefaz);

// ==========================================
// 📦 OPERAÇÕES DE PEDIDOS (SAÍDA) E XML (ENTRADA)
// ==========================================
router.get('/saida', listarNotasSaida);
router.post('/saida/rascunho', gerarRascunhoSaida);
router.post('/saida/:id/emitir', emitirNotaSaida);

router.post('/entrada/importar', upload.single('xml'), importarXmlEntrada);
router.post('/entrada/confirmar', confirmarXmlEntrada);

// ==========================================
// 🚀 EMISSÃO DE NF-E (55) E NFC-E (65)
// ==========================================
router.post('/nfe/emitir', (req, res, next) => {
    req.url = '/emitir';
    notasRouter(req, res, next);
});

router.post('/nfce/emitir', (req, res, next) => {
    req.url = '/emitir';
    notasRouter(req, res, next);
});

// ==========================================
// 🧾 GESTÃO DE NOTAS E EVENTOS FISCAIS
// ==========================================
router.use('/notas', notasRouter);
router.use('/eventos', eventosRouter);

// ==========================================
// 🏷️ CENÁRIOS, REGRAS E TABELAS FISCAIS
// ==========================================
router.use('/cenarios', cenariosRouter);
router.use('/cenarios-fiscais', cenariosRouter);
router.use('/regras', regrasRouter);
router.use('/regras-tributarias', regrasRouter);
router.use('/tabelas', tabelasRouter);
router.use('/tabelas-fiscais', tabelasRouter);

// ==========================================
// 👥 CADASTROS AUXILIARES FISCAIS
// ==========================================
router.use('/estabelecimentos', estabelecimentosRouter);
router.use('/certificados', certificadosRouter);
router.use('/series', seriesRouter);
router.use('/series-numeracao', seriesRouter);
router.use('/destinatarios', destinatariosRouter);
router.use('/formas-pagamento', formasPagamentoRouter);
router.use('/produtos', produtosRouter);
router.use('/produtos-fiscais', produtosRouter);
router.use('/webhooks', webhooksRouter);
router.use('/tokens', tokensRouter);

export default router;