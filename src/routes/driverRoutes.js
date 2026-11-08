import express from 'express';
import {
    driverLogin,
    getDriverFeed,
    claimOrder,
    updateDriverGps,
    completeDelivery
} from '../controllers/driverController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { requirePermission } from '../middlewares/permissionMiddleware.js';

const router = express.Router();

// 🟢 1. Rota de Login do Motorista (Valida se o cargo tem DRIVER_APP_ACCESS)
router.post('/login', driverLogin);

// 🟢 2. Rotas Protegidas pela Catraca do Aplicativo Android (Requer DRIVER_APP_ACCESS)
router.use(protect);
router.use(requirePermission('DRIVER_APP_ACCESS'));

// Feed com Fila Aberta, Minhas Entregas e Histórico de Ganhos
router.get('/feed', getDriverFeed);

// Aceitar/Pegar pedido da Fila Aberta (Modo QUEUE)
router.post('/orders/:id/claim', claimOrder);

// Atualização de GPS em segundo plano / tempo real
router.put('/gps', updateDriverGps);

// Concluir Entrega informando o PIN do Cliente
router.post('/orders/:id/complete', completeDelivery);

export default router;
