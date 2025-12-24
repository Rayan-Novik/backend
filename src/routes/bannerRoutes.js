import express from 'express';
const router = express.Router();
import {
    getActiveBanners,
    getAllBanners,
    createBanner,
    updateBanner,
    deleteBanner
} from '../controllers/bannerController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';

router.get('/active', getActiveBanners); // Rota pública

router.route('/')
    .get(protect, admin, getAllBanners)
    .post(protect, admin, createBanner);

router.route('/:id')
    .put(protect, admin, updateBanner)
    .delete(protect, admin, deleteBanner);

export default router;
