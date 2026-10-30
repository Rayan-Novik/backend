import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import { injectFiscalTenant } from '../modules/fiscal/shared/tenantHelper.js';
import { tabelasRouter } from '../modules/fiscal/tabelas-fiscais/tabelas.routes.js';
import { regrasRouter } from '../modules/fiscal/regras-tributarias/regras.routes.js';

const router = express.Router();

router.use(protect, injectFiscalTenant);

// /api/tabelas-fiscais/sugerir?ncm=... -> redireciona para /sugerir do regrasRouter
router.get('/sugerir', (req, res, next) => {
    req.url = '/sugerir' + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '');
    regrasRouter(req, res, next);
});

// /api/tabelas-fiscais/regras/:tipo (GET, POST, PUT, DELETE)
router.use('/regras', regrasRouter);

// /api/tabelas-fiscais/:tabela (cfop, ncm, cest, cst, csosn, origem, class-trib-ibs, etc.)
router.use('/', tabelasRouter);

export default router;