import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';
import { getConfig, saveConfig, testConnection, triggerManualSync } from '../controllers/integrationController.js';

const router = express.Router();

router.get('/', protect, admin, getConfig);
router.post('/', protect, admin, saveConfig);
router.post('/test', protect, admin, testConnection);
router.post('/sync', protect, admin, triggerManualSync);

export default router;