// routes/mercadoLivreRoutes.js
import express from 'express';
import { getCategoryAttributes, getCategoryDetails, getMainCategories, getSellerOrders, getSellerOrderById, uploadInvoice} from '../controllers/mercadoLivreController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';
import multer from 'multer';

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const router = express.Router();

router.route('/attributes/:categoryId').get(protect, admin, getCategoryAttributes);

router.route('/categories').get(protect, admin, getMainCategories);
router.route('/categories/:id').get(protect, admin, getCategoryDetails);

router.route('/orders').get(protect, admin, getSellerOrders);
router.route('/orders/:id').get(protect, admin, getSellerOrderById);
router.route('/shipments/:shipment_id/invoice').post(
    protect,
    admin,
    upload.single('invoice_xml'), // 'invoice_xml' é o nome do campo do formulário
    uploadInvoice
);


export default router;