import multer from 'multer';

// Configura o multer para guardar a imagem na memória RAM temporariamente,
// em vez de salvá-la no disco do servidor. Isso é ideal para repassá-la para outro serviço (Imgur).
const storage = multer.memoryStorage();

// Filtro para garantir que apenas arquivos de imagem sejam aceitos
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true); // Aceita o arquivo
    } else {
        // Rejeita o arquivo com uma mensagem de erro
        cb({ message: 'Apenas arquivos de imagem são permitidos (png, jpg, etc.)!' }, false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 1024 * 1024 * 5 // Limite de 5 MB por imagem
    }
});

export default upload;
