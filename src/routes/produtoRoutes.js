import express from 'express';
const router = express.Router();
import {
    getAllProdutos,
    getProdutoById,
    createProduto,
    updateProduto,
    deleteProduto,
    getProdutosPorCategoria,
    getProdutosBySubcategoria,
    getProdutosPorMarca,
    searchProdutos,
    publishToMercadoLivre,
    getProdutosFiltrados,
    updateMercadoLivreStatus,
    syncMercadoLivreStatus,
    getPopularProdutos,
    getProdutosAgrupadosPorCategoria,
    toggleProductEcommerce,
    getProdutoRastreio,
    ajustarEstoqueManual,
    getProdutoAuditoria,
    getGlobalHistory,
    getComposicaoProduto,
    setComposicaoProduto,
    fabricarProduto 
} from '../controllers/produtoController.js';

import { protect } from '../middlewares/authMiddleware.js';
// 🟢 A Catraca
import { requirePermission } from '../middlewares/permissionMiddleware.js';

// ============================================================================
//                                ROTAS PÚBLICAS (E-COMMERCE)
// ============================================================================

// 🟢 MUDANÇA AQUI: O GET da lista principal agora é público para a Home carregar!
router.route('/').get(getAllProdutos);

router.route('/popular').get(getPopularProdutos);
router.route('/filter').get(getProdutosFiltrados);

// Busca para PDV e E-commerce
router.get('/busca', searchProdutos);
router.route('/search/:keyword').get(searchProdutos);

router.route('/categoria/:nome').get(getProdutosPorCategoria);
router.get('/sub/:id', getProdutosBySubcategoria);
router.route('/marca/:nome').get(getProdutosPorMarca);
router.route('/por-categoria').get(getProdutosAgrupadosPorCategoria);

// 🟢 A rota de ver os detalhes do produto TAMBÉM É PÚBLICA! 
// Qualquer cliente no e-commerce pode acessar sem precisar de token de Admin.
router.route('/:id').get(getProdutoById);

// ============================================================================
//                                ROTAS DA EQUIPE (COM CATRACA)
// ============================================================================

// 🔴 O POST (Criar produto) continua trancado na catraca!
router.route('/')
    .post(protect, requirePermission('PRODUTOS_MANAGE'), createProduto);

// 🟢 Aqui ficam só as rotas de EDITAR e DELETAR protegidas.
router.route('/:id')
    .put(protect, requirePermission('PRODUTOS_MANAGE'), updateProduto)
    .delete(protect, requirePermission('PRODUTOS_MANAGE'), deleteProduto);


// ✅ AUDITORIA GLOBAL
router.route('/auditoria/global').get(protect, requirePermission('ESTOQUE_MANAGE'), getGlobalHistory);

// ✅ MANUFATURA & CRAFTING
router.route('/:id/composicao')
    .get(protect, requirePermission('PRODUTOS_VIEW'), getComposicaoProduto)
    .post(protect, requirePermission('PRODUTOS_MANAGE'), setComposicaoProduto);

router.route('/:id/fabricar').post(protect, requirePermission('ESTOQUE_MANAGE'), fabricarProduto);

// ✅ RASTREIO E ESTOQUE
router.route('/:id/rastreio').get(protect, requirePermission('ESTOQUE_MANAGE'), getProdutoRastreio);
router.route('/:id/auditoria').get(protect, requirePermission('PRODUTOS_VIEW'), getProdutoAuditoria);
router.route('/:id/estoque').post(protect, requirePermission('ESTOQUE_MANAGE'), ajustarEstoqueManual);

// ✅ INTEGRAÇÕES E STATUS
router.route('/:id/ecommerce-status').put(protect, requirePermission('PRODUTOS_MANAGE'), toggleProductEcommerce);
router.route('/:id/publish-ml').post(protect, requirePermission('PRODUTOS_MANAGE'), publishToMercadoLivre);
router.route('/:id/ml-status').put(protect, requirePermission('PRODUTOS_MANAGE'), updateMercadoLivreStatus);
router.route('/:id/ml-sync').get(protect, requirePermission('PRODUTOS_MANAGE'), syncMercadoLivreStatus);

export default router;