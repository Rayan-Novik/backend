import express from 'express';
import {
    getAllUsuarios,
    getUsuarioById,
    registrarUsuario,
    loginUsuario,
    getUsuarioProfile,
    updateUsuarioProfile,
    forgotPassword,
    resetPassword,
    registrarUsuarioPDV,
    searchUsuarios,
    // --- IMPORTAR AS NOVAS FUNÇÕES AQUI ---
    updateUsuarioByAdmin, 
    deleteUsuario,
    googleLogin,
    getGoogleClientId,
    updateGoogleClientId
} from '../controllers/usuarioController.js';

import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';

const router = express.Router();

// =================================================
// ROTAS PÚBLICAS
// =================================================
router.post('/', registrarUsuario);
router.post('/login', loginUsuario);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);
router.post('/google-login', googleLogin);

router.get('/google-client-id', getGoogleClientId);


// =================================================
// ROTA DO PERFIL (Usuário logado edita a si mesmo)
// =================================================
router
    .route('/perfil')
    .get(protect, getUsuarioProfile)
    .put(protect, updateUsuarioProfile);

// =================================================
// ROTAS DE ADMINISTRADOR
// =================================================


router.put('/google-client-id', protect, admin, updateGoogleClientId);

// Buscas e Cadastro via PDV
router.get('/search/:term', protect, admin, searchUsuarios);
router.post('/pdv', protect, admin, registrarUsuarioPDV);

// Listagem Geral
router.get('/', protect, admin, getAllUsuarios);

// Gerenciamento por ID (Ver, Editar como Admin, Deletar)
router
    .route('/:id')
    .get(protect, admin, getUsuarioById)       // Já existia
    .put(protect, admin, updateUsuarioByAdmin) // NOVO: Admin altera role/nome
    .delete(protect, admin, deleteUsuario);    // NOVO: Admin deleta conta

export default router;