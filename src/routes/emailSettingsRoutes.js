import express from 'express';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';
import { 
    getEmailConfig, 
    updateEmailConfig, 
    testEmailConnection,
    getConfigByKey,
    triggerTestScenario,
} from '../controllers/emailSettingsController.js';

const router = express.Router();

router.get('/email', protect, admin, getEmailConfig);
router.put('/email', protect, admin, updateEmailConfig);
router.post('/email/test', protect, admin, testEmailConnection);

router.get('/public/:key', protect, getConfigByKey);
router.post('/email/test-scenario', protect, admin, triggerTestScenario);

export default router;