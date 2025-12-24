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
    toggleProductEcommerce, // 👈 IMPORTADO AQUI
} from '../controllers/produtoController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';

// --- ROTAS PÚBLICAS ---

// Rotas com palavras específicas devem vir ANTES de rotas com parâmetros como /:id
router.route('/popular').get(getPopularProdutos);
router.route('/filter').get(getProdutosFiltrados);
router.route('/search/:keyword').get(searchProdutos);
router.route('/categoria/:nome').get(getProdutosPorCategoria);
router.get('/sub/:id', getProdutosBySubcategoria);
router.route('/marca/:nome').get(getProdutosPorMarca);
router.route('/por-categoria').get(getProdutosAgrupadosPorCategoria);

// Rota genérica para buscar todos os produtos
router.route('/').get(getAllProdutos);

// Rota genérica para buscar por ID (deve ser a última das rotas GET públicas para evitar conflitos)
router.route('/:id').get(getProdutoById);


// --- ROTAS DE ADMIN ---
router.route('/').post(protect, admin, createProduto);

// Rota para ativar/desativar no E-commerce (NOVA)
router.route('/:id/ecommerce-status').put(protect, admin, toggleProductEcommerce);

// Rotas do Mercado Livre
router.route('/:id/publish-ml').post(protect, admin, publishToMercadoLivre);
router.route('/:id/ml-status').put(protect, admin, updateMercadoLivreStatus);
router.route('/:id/ml-sync').get(protect, admin, syncMercadoLivreStatus);

// Rotas gerais de edição/remoção
router.route('/:id')
    .put(protect, admin, updateProduto)
    .delete(protect, admin, deleteProduto);

export default router;