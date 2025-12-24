import express from 'express';
import { getWishlist, addToWishlist, removeFromWishlist } from '../controllers/wishlistController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Todas as rotas aqui são protegidas, pois apenas utilizadores logados podem ter uma lista de desejos.
router.route('/')
    .get(protect, getWishlist)
    .post(protect, addToWishlist);

router.route('/:productId')
    .delete(protect, removeFromWishlist);

export default router;
