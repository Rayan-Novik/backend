import { Router } from 'express';
import { getWhazingConfig, updateWhazingConfig } from '../controllers/integration/whazing/WhazingConfigController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = Router();

// Aplica o middleware de autenticação nas rotas
router.use(protect);

router.get('/', getWhazingConfig);
router.post('/', updateWhazingConfig);

export default router;