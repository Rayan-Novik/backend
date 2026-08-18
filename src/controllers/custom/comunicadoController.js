import ComunicadoModel from '../../models/comunicadoModel.js';

export const getActiveComunicado = async (req, res, next) => {
    try {
        // 🟢 Puxa o ID da loja da URL
        const tenantId = parseInt(req.params.tenantId) || 1;
        const comunicado = await ComunicadoModel.findActive(tenantId);
        res.json(comunicado);
    } catch (error) { next(error); }
};

export const getAllComunicados = async (req, res, next) => {
    try {
        const comunicados = await ComunicadoModel.findAll(req.tenantId);
        res.json(comunicados);
    } catch (error) { next(error); }
};

export const createComunicado = async (req, res, next) => {
    try {
        const newComunicado = await ComunicadoModel.create(req.body, req.tenantId);
        res.status(201).json(newComunicado);
    } catch (error) { next(error); }
};

export const updateComunicado = async (req, res, next) => {
    try {
        const updatedComunicado = await ComunicadoModel.update(Number(req.params.id), req.body, req.tenantId);
        res.json(updatedComunicado);
    } catch (error) { next(error); }
};

export const deleteComunicado = async (req, res, next) => {
    try {
        await ComunicadoModel.remove(Number(req.params.id), req.tenantId);
        res.json({ message: 'Comunicado removido com sucesso' });
    } catch (error) { next(error); }
};