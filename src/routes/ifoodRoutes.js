import express from 'express';
// IMPORTANTE: Adicione o .js no final para não dar o erro ERR_MODULE_NOT_FOUND
import * as ifoodController from '../controllers/integration/ifood/ifoodController.js';
import * as produtoIfoodController from '../controllers/integration/ifood/produtoIfoodController.js';

// ATENÇÃO: Importe aqui o seu middleware que valida o token do usuário (o mesmo usado nas outras rotas)
import { protect } from '../middlewares/authMiddleware.js'; 

// 🟢 Importando a Catraca de Permissões
import { requirePermission } from '../middlewares/permissionMiddleware.js';

const router = express.Router();

// Aplica a proteção em todas as rotas abaixo (garante que req.tenantId exista)
router.use(protect); 

// Rotas de Autenticação e Setup
router.get('/status', ifoodController.checkAuthStatus);
router.post('/auth', ifoodController.connectIfood);     // Conecta a loja ao iFood
router.delete('/auth', ifoodController.disconnectIfood); // Desconecta a loja

// Rotas de Sincronização de Produtos e Ofertas
router.post('/produtos/:id/sync', produtoIfoodController.syncProdutoToIfood); // Cria Produto e Oferta
router.post('/produtos/:id/foto', produtoIfoodController.syncFotoIfood);      // Atualiza só a foto
router.patch('/produtos/:id/status', produtoIfoodController.updateIfoodStatus); // Pausa/Retoma

// Criação de Combos e Complementos
router.post('/produtos/:id/combo', produtoIfoodController.syncComboIfood);
router.get('/produtos/:id/combo', produtoIfoodController.getComboIfood);
router.delete('/produtos/:id/combo', produtoIfoodController.deleteComboIfood);

export default router;