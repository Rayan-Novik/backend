import path from 'path';
import express from 'express';
import multer from 'multer';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';
import { fileURLToPath } from 'url';
import fs from 'fs';

const router = express.Router();

// Lógica para encontrar o caminho correto (ES Modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storage = multer.diskStorage({
    destination(req, file, cb) {
        // ✅ CORREÇÃO: Salva na pasta 'images' na raiz do BACKEND
        // __dirname está em 'src/routes', então voltamos 2 níveis (../../) para chegar na raiz do backend
        const uploadPath = path.join(__dirname, '../../images');

        // Cria a pasta se ela não existir
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }

        cb(null, uploadPath); 
    },
    filename(req, file, cb) {   
        // Mantém o nome fixo para substituir o logo anterior
        cb(null, 'logoheader.png');
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
        cb(new Error('Apenas imagens são permitidas!'));
    }
}

const upload = multer({
    storage,
    fileFilter: function(req, file, cb) {
        checkFileType(file, cb);
    }
});

// Rota POST /api/upload
router.post('/', protect, admin, upload.single('image'), (req, res) => {
    // Retorna o caminho que o frontend vai usar para acessar a imagem via API
    // O timestamp (?t=...) força o navegador a baixar a nova imagem em vez de usar o cache
    res.send({
        message: 'Imagem enviada com sucesso',
        imagePath: `/images/logoheader.png?t=${Date.now()}`
    });
});

export default router;