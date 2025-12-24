// Em enderecoRoutes.js

import express from 'express';
import {
    listarEnderecos,
    adicionarEndereco,
    atualizarEndereco,
    removerEndereco // 1. IMPORTE A NOVA FUNÇÃO
} from '../controllers/enderecoController.js';

import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.route('/')
    .get(listarEnderecos)
    .post(adicionarEndereco);

router.route('/:id')
    .put(atualizarEndereco)
    .delete(removerEndereco);

export default router;