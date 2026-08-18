import express from 'express';
// ✅ CORREÇÃO: Importa a função com o nome correto: 'generateSingleImageVariation'.
import { generateSingleImageVariation } from '../controllers/imageGeneratorController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';
import upload from '../middlewares/uploadMiddleware.js';

const router = express.Router();

// ✅ CORREÇÃO: A rota agora chama a função correta e lida com o upload de um ficheiro.
router.post('/generate-from-image', protect, admin, upload.single('image'), generateSingleImageVariation);

export default router;

