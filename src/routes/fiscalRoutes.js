import express from 'express';
import multer from 'multer';

// Middlewares
import { protect } from '../middlewares/authMiddleware.js';
import { requirePermission } from '../middlewares/permissionMiddleware.js'; // Caso queira usar nas rotas depois

// Controllers Refatorados
import { 
    getConfiguracaoFiscal, 
    upsertConfiguracaoFiscal,
    lerDadosCertificado,
    testarConexaoSefaz
} from '../controllers/fiscal/configuracaoFiscalController.js';

import { 
    listarNotasSaida, 
    gerarNotaRascunho,
    emitirNota // 🟢 NOVA FUNÇÃO IMPORTADA
} from '../controllers/fiscal/production/notaSaidaController.js';

import { 
    listarNotasEntrada, 
    importarXmlEntrada,
    confirmarEntrada // 🟢 IMPORTADO PARA FINALIZAR A ENTRADA DE NOTA
} from '../controllers/fiscal/production/notaEntradaController.js';

import { 
    simularEmissaoSaida, 
    simularEmissaoEntrada 
} from '../controllers/fiscal/sandbox/simulacaoFiscalController.js';

// Configura o multer para não gravar em disco, só jogar na memória (buffer)
const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

// ==========================================
// ⚙️ CONFIGURAÇÕES FISCAIS
// ==========================================
router.get('/configuracao', protect, getConfiguracaoFiscal);
router.post('/configuracao', protect, upload.single('certificado'), upsertConfiguracaoFiscal);
router.post('/configuracao/ler-certificado', protect, upload.single('certificado'), lerDadosCertificado);
router.get('/testar-sefaz', protect, testarConexaoSefaz); // Teste de Conexão com SEFAZ


// ==========================================
// 📤 NOTAS DE SAÍDA (VENDAS - PRODUÇÃO)
// ==========================================
router.get('/saida', protect, listarNotasSaida);
router.post('/saida/rascunho', protect, gerarNotaRascunho);
router.post('/saida/:id/emitir', protect, emitirNota); // 🟢 Rota Oficial Nova

// 🟢 Rotas de compatibilidade (Para não quebrar os botões antigos do seu Frontend)
router.post('/notas/rascunho', protect, gerarNotaRascunho);
router.post('/notas/:id/emitir', protect, emitirNota); 


// ==========================================
// 📥 NOTAS DE ENTRADA (COMPRAS - PRODUÇÃO)
// ==========================================
router.get('/entrada', protect, listarNotasEntrada);
// Usa o multer para ler o arquivo XML do upload via multipart/form-data
router.post('/entrada/importar', protect, upload.single('xml'), importarXmlEntrada);
// Rota que salva a nota no banco e alimenta o estoque de verdade
router.post('/entrada/confirmar', protect, confirmarEntrada); // 🟢 ROTA ADICIONADA


// ==========================================
// 🧪 AMBIENTE DE SIMULAÇÃO (TESTES)
// ==========================================
// Aprova a nota de saída na hora sem bater na SEFAZ (Substitui a antiga /notas/:id/emitir)
router.post('/simular/saida/:id', protect, simularEmissaoSaida);

// Cria uma nota de entrada fake e injeta no estoque (Ótimo para testar o sistema)
router.post('/simular/entrada', protect, simularEmissaoEntrada);

export default router;