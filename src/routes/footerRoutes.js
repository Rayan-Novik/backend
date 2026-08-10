import express from 'express';
import { getFooterConfig, saveLink, deleteLink, updateSobreTexto } from '../controllers/footerController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';

const router = express.Router();

router.get('/', getFooterConfig); // Público
router.post('/link', protect, admin, saveLink);
router.delete('/link/:id', protect, admin, deleteLink);
router.post('/sobre', protect, admin, updateSobreTexto);

export default router;