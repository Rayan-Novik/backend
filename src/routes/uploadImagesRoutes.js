import express from 'express'; // ✅ CORREÇÃO: Esta linha estava em falta.
import { uploadImageToImgBB } from '../controllers/UploadImagesController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';
import upload from '../middlewares/uploadMiddleware.js';

const router = express.Router();

// A rota continua a mesma, mas agora o 'express' está definido.
router.post('/', protect, admin, upload.single('image'), uploadImageToImgBB);

router.post('/review', protect, upload.single('image'), uploadImageToImgBB);

export default router;
