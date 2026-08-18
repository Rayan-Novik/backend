import express from 'express';
import { 
    getCategoryAttributes, 
    getCategoryDetails, 
    getMainCategories, 
    getSellerOrders, 
    getSellerOrderById, 
    uploadInvoice, 
    getMlQuestions, 
    answerQuestion 
} from '../controllers/mercadoLivreController.js';
import { protect } from '../middlewares/authMiddleware.js';
// 🟢 Importando a nossa catraca inteligente
import { requirePermission } from '../middlewares/permissionMiddleware.js';
import multer from 'multer';

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const router = express.Router();

// 🔓 Rota de Verificação (Mantida como você definiu)
router.get('/check-auth', (req, res) => {
    return res.status(200).json({ isAuthenticated: false });
});

// ==========================================================
// 🛠️ CONFIGURAÇÕES E CATEGORIAS (Integração)
// ==========================================================
router.route('/attributes/:categoryId').get(protect, requirePermission('PRODUTOS_MANAGE'), getCategoryAttributes);
router.route('/categories').get(protect, requirePermission('PRODUTOS_MANAGE'), getMainCategories);
router.route('/categories/:id').get(protect, requirePermission('PRODUTOS_MANAGE'), getCategoryDetails);

// ==========================================================
// 💬 SAC E ATENDIMENTO (Perguntas e Respostas)
// ==========================================================
router.route('/questions').get(protect, requirePermission('AVALIACOES_MANAGE'), getMlQuestions);
router.route('/questions/answer').post(protect, requirePermission('AVALIACOES_MANAGE'), answerQuestion);

// ==========================================================
// 📦 LOGÍSTICA E FATURAMENTO (Pedidos e Notas Fiscais)
// ==========================================================
router.route('/orders').get(protect, requirePermission('PEDIDOS_VIEW'), getSellerOrders);
router.route('/orders/:id').get(protect, requirePermission('PEDIDOS_VIEW'), getSellerOrderById);

// Upload de Nota Fiscal (XML) - Requer gestão de pedidos/fiscal
router.route('/shipments/:shipment_id/invoice').post(
    protect,
    requirePermission('PEDIDOS_MANAGE'),
    upload.single('invoice_xml'),
    uploadInvoice
);

export default router;