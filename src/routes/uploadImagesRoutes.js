import express from 'express';
import { uploadImage, getUploadProvider, getMediaGallery } from '../controllers/UploadImagesController.js';
import { protect } from '../middlewares/authMiddleware.js';
import upload from '../middlewares/uploadMiddleware.js';

const router = express.Router();

// 🟢 AS ROTAS PRECISAM ESTAR APENAS COM "protect" E NADA DE "admin"!
router.post('/', protect, upload.single('image'), uploadImage);
router.post('/review', protect, upload.single('image'), uploadImage);
router.get('/UPLOAD_PROVIDER', protect, getUploadProvider);
router.get('/gallery', protect, getMediaGallery);

export default router;