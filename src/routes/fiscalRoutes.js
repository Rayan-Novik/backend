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
    gerarNotaRascunho 
} from '../controllers/fiscal/production/notaSaidaController.js';

import { 
    listarNotasEntrada, 
    importarXmlEntrada 
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


// ==========================================
// 📤 NOTAS DE SAÍDA (VENDAS - PRODUÇÃO)
// ==========================================
router.get('/saida', protect, listarNotasSaida);
router.post('/saida/rascunho', protect, gerarNotaRascunho);


// ==========================================
// 📥 NOTAS DE ENTRADA (COMPRAS - PRODUÇÃO)
// ==========================================
router.get('/entrada', protect, listarNotasEntrada);
// Usa o multer para ler o arquivo XML do upload via multipart/form-data
router.post('/entrada/importar', protect, upload.single('xml'), importarXmlEntrada);


// ==========================================
// 🧪 AMBIENTE DE SIMULAÇÃO (TESTES)
// ==========================================
// Aprova a nota de saída na hora sem bater na SEFAZ (Substitui a antiga /notas/:id/emitir)
router.post('/simular/saida/:id', protect, simularEmissaoSaida);

// Cria uma nota de entrada fake e injeta no estoque (Ótimo para testar o sistema)
router.post('/simular/entrada', protect, simularEmissaoEntrada);

router.get('/testar-sefaz', protect, testarConexaoSefaz);

export default router;