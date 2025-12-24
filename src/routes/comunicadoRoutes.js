import express from 'express';
const router = express.Router();
import {
    getActiveComunicado,
    getAllComunicados,
    createComunicado,
    updateComunicado,
    deleteComunicado
} from '../controllers/comunicadoController.js';
import { protect } from '../middlewares/authMiddleware.js';
import { admin } from '../middlewares/adminMiddleware.js';

router.get('/active', getActiveComunicado); // Rota pública

router.route('/')
    .get(protect, admin, getAllComunicados)
    .post(protect, admin, createComunicado);

router.route('/:id')
    .put(protect, admin, updateComunicado)
    .delete(protect, admin, deleteComunicado);

export default router;
