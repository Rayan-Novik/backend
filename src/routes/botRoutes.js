// routes/botRoutes.js
import express from 'express';
import { testAbandonedCarts, testPendingPayments, testEmailSending } from '../controllers/botController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';

const router = express.Router();

// Define as rotas de teste, protegidas para que só o admin possa usá-las
router.get('/test-abandoned-cart', protect, admin, testAbandonedCarts);
router.get('/test-pending-payment', protect, admin, testPendingPayments);

router.get('/test-email', protect, admin, testEmailSending);

export default router;