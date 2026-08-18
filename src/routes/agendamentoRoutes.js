import express from 'express';
import {
    getHorariosDisponiveis,
    criarAgendamento,
    getAgendamentosAdmin,
    updateStatusAgendamento,
    getMeusAgendamentos,
} from '../controllers/agendamento/agendamentoController.js';

import { criarPedidoAgendamento } from '../controllers/agendamento/agendamentoPedidoController.js';

import { protect } from '../middlewares/authMiddleware.js';
import { requirePermission } from '../middlewares/permissionMiddleware.js';

const router = express.Router();

// =================================================
// 🔓 ROTAS PÚBLICAS (Ecommerce/Frontend)
// =================================================
// O cliente consulta os horários livres da loja/funcionário
router.get('/disponiveis', getHorariosDisponiveis);

router.post('/checkout', protect, criarPedidoAgendamento);

// =================================================
// 🔒 ROTAS DO CLIENTE (Logado no Ecommerce)
// =================================================
// O cliente agenda o serviço (precisa estar logado para pegar o id_usuario)
router.post('/', protect, criarAgendamento);

router.get('/meus', protect, getMeusAgendamentos);

// =================================================
// 💼 ROTAS ADMINISTRATIVAS (Painel do Dono)
// =================================================
// O dono ou atendente vê a agenda e gerencia status
router.get('/admin', protect, requirePermission('AGENDAMENTOS_VIEW'), getAgendamentosAdmin);
router.put('/admin/:id', protect, requirePermission('AGENDAMENTOS_MANAGE'), updateStatusAgendamento);

export default router;