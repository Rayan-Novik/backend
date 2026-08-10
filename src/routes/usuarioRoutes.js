import express from 'express';

// Importa do Controller de Clientes Finais
import {
    getAllUsuarios,
    getUsuarioById,
    registrarUsuario,
    loginClienteEcommerce,
    getUsuarioProfile,
    updateUsuarioProfile,
    forgotPassword,
    resetPassword,
    registrarUsuarioPDV,
    searchUsuarios,
    updateUsuarioByAdmin,
    deleteUsuario,
    googleLogin
} from '../controllers/users/usuarioController.js';

// Importa do Controller de Funcionários
import {
    loginFuncionario,
    getAllFuncionarios,
    registrarFuncionario,
    updateFuncionario,
    deleteFuncionario,
    getFuncionarioProfile,    // 🟢 ADICIONADO: Buscar perfil profissional
    updateFuncionarioProfile  // 🟢 ADICIONADO: Atualizar perfil profissional
} from '../controllers/users/funcionarioController.js';

// Importa do Controller do Dono da Loja (Tenant)
import {
    loginAdmin,
    getGoogleClientId,
    updateGoogleClientId
} from '../controllers/users/tenantUserController.js';

import { protect } from '../middlewares/authMiddleware.js';
// 🟢 ADEUS ADMIN, OLÁ CATRACA INTELIGENTE!
import { requirePermission } from '../middlewares/permissionMiddleware.js';

const router = express.Router();

// =================================================
// 🔓 ROTAS DE AUTENTICAÇÃO PÚBLICA
// =================================================

// Logins
router.post('/store-login', loginClienteEcommerce); // Cliente final logando na loja
router.post('/staff-login', loginFuncionario);      // Funcionário (Caixa/Atendente) logando no PDV/Painel
router.post('/admin-login', loginAdmin);            // Proprietário logando no Master Painel
router.post('/google-login', googleLogin);

// Cadastro e Senha
router.post('/', registrarUsuario);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword);

// =================================================
// ⚙️ ROTAS DE CONFIGURAÇÃO DO TENANT
// =================================================
router.get('/google-client-id', getGoogleClientId);
// 🟢 Protegido por Integrações
router.put('/google-client-id', protect, requirePermission('CONFIG_INTEGRATIONS'), updateGoogleClientId);

// =================================================
// 👤 ROTA DO PERFIL (Usuário Logado)
// =================================================
router.route('/perfil')
    .get(protect, getUsuarioProfile)
    .put(protect, updateUsuarioProfile);

// =================================================
// 💼 ROTAS DE GESTÃO DE FUNCIONÁRIOS
// =================================================

// 🟢 NOVO: O próprio funcionário visualiza e edita seu perfil profissional (sem precisar de permissão administrativa)
router.route('/staff/me/perfil')
    .get(protect, getFuncionarioProfile)
    .put(protect, updateFuncionarioProfile);

// 🟢 GET: Exige apenas EQUIPE_VIEW (Permite que o usuário veja a lista da equipe)
router.get('/staff', protect, requirePermission('EQUIPE_VIEW'), getAllFuncionarios);

// 🔴 POST: Exige EQUIPE_MANAGE (Apenas quem edita pode cadastrar)
router.post('/staff', protect, requirePermission('EQUIPE_MANAGE'), registrarFuncionario);

// 🔴 PUT e DELETE: Exigem EQUIPE_MANAGE (Apenas quem edita pode atualizar ou apagar)
router.route('/staff/:id')
    .put(protect, requirePermission('EQUIPE_MANAGE'), updateFuncionario)
    .delete(protect, requirePermission('EQUIPE_MANAGE'), deleteFuncionario);

// 🟢 NOVO: Admin visualiza/edita o perfil profissional de um funcionário específico pelo ID
router.route('/staff/:id/perfil')
    .get(protect, requirePermission('EQUIPE_VIEW'), getFuncionarioProfile)
    .put(protect, requirePermission('EQUIPE_MANAGE'), updateFuncionarioProfile);


// =================================================
// 🛒 ROTAS DE GESTÃO DE CLIENTES (Requer CLIENTES_MANAGE)
// =================================================

// Buscas e Cadastro via PDV 
router.get('/search/:term', protect, requirePermission('CLIENTES_MANAGE'), searchUsuarios);
router.post('/pdv', protect, requirePermission('CLIENTES_MANAGE'), registrarUsuarioPDV);

// Listagem Geral
router.get('/', protect, requirePermission('CLIENTES_MANAGE'), getAllUsuarios);

// Gerenciamento de Clientes por ID
router.route('/:id')
    .get(protect, requirePermission('CLIENTES_MANAGE'), getUsuarioById)       
    .put(protect, requirePermission('CLIENTES_MANAGE'), updateUsuarioByAdmin) 
    .delete(protect, requirePermission('CLIENTES_MANAGE'), deleteUsuario);    

export default router;