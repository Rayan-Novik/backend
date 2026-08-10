import express from 'express';
import { 
    getConfiguracaoFiscal, 
    upsertConfiguracaoFiscal 
} from '../controllers/fiscal/configuracaoFiscalController.js';
import { 
    listarNotasFiscais, 
    gerarNotaRascunho, 
    simularEmissaoSefaz 
} from '../controllers/fiscal/notaFiscalController.js';

import { protect } from '../middlewares/authMiddleware.js';
import { requirePermission } from '../middlewares/permissionMiddleware.js';
import multer from 'multer';

// Configura o multer para não gravar em disco, só jogar na memória (buffer)
const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

// ==========================================
// ⚙️ CONFIGURAÇÕES FISCAIS
// ==========================================
router.get('/configuracao', protect, getConfiguracaoFiscal);
router.post('/configuracao', protect, upload.single('certificado'), upsertConfiguracaoFiscal);

// ==========================================
// 🧾 NOTAS FISCAIS
// ==========================================
router.get('/notas', protect, listarNotasFiscais);
router.post('/notas/rascunho', protect, gerarNotaRascunho);
router.post('/notas/:id/emitir', protect, simularEmissaoSefaz); // Nossa rota simuladora

export default router;