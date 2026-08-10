import express from 'express';
const router = express.Router();
import {
    getActiveBanners,
    getAllBanners,
    createBanner,
    updateBanner,
    deleteBanner
} from '../controllers/custom/bannerController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { requirePermission } from '../middlewares/permissionMiddleware.js';

router.get('/active', getActiveBanners);
router.get('/active/:tenantId', getActiveBanners);

router.route('/')
    .get(protect, requirePermission('CONFIG_APARENCIA'), getAllBanners)
    .post(protect, requirePermission('CONFIG_APARENCIA'), createBanner);

router.route('/:id')
    .put(protect, requirePermission('CONFIG_APARENCIA'), updateBanner)
    .delete(protect, requirePermission('CONFIG_APARENCIA'), deleteBanner);

export default router;