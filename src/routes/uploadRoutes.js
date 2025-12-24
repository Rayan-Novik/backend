import path from 'path';
import express from 'express';
import multer from 'multer';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';
import { fileURLToPath } from 'url';

const router = express.Router();

// Lógica para encontrar o caminho correto entre as pastas
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.diskStorage({
    destination(req, file, cb) {
        // Navega para a pasta correta: sai de 'backend/src/routes', sobe duas vezes para 'www',
        // e depois entra em 'frontend/public/images'
        const uploadPath = path.join(__dirname, '../../../frontend/public/images');
        cb(null, uploadPath); 
    },
    filename(req, file, cb) {   
        // ✅ ALTERAÇÃO: Define o nome do ficheiro como 'logoheader.png',
        // substituindo o ficheiro existente para manter o link consistente.
        cb(null, `logoheader.png`);
    }
});

// Função para verificar se o ficheiro é uma imagem
function checkFileType(file, cb) {
    const filetypes = /jpg|jpeg|png|svg|webp/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (extname && mimetype) {
        return cb(null, true);
    } else {
        cb('Apenas imagens são permitidas!');
    }
}

const upload = multer({
    storage,
    fileFilter: function(req, file, cb) {
        checkFileType(file, cb);
    }
});

// Cria a rota POST /api/upload
router.post('/', protect, admin, upload.single('image'), (req, res) => {
    // Se o upload for bem-sucedido, devolve o caminho público do ficheiro.
    // ✅ ALTERAÇÃO: Adiciona um timestamp como query string para evitar problemas de cache no navegador.
    res.send({
        message: 'Imagem enviada com sucesso',
        imagePath: `/images/logoheader.png?t=${Date.now()}`
    });
});

export default router;
