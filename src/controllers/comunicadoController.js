import ComunicadoModel from '../models/comunicadoModel.js';

export const getActiveComunicado = async (req, res, next) => {
    try {
        const comunicado = await ComunicadoModel.findActive();
        res.json(comunicado);
    } catch (error) { next(error); }
};

export const getAllComunicados = async (req, res, next) => {
    try {
        const comunicados = await ComunicadoModel.findAll();
        res.json(comunicados);
    } catch (error) { next(error); }
};

export const createComunicado = async (req, res, next) => {
    try {
        const newComunicado = await ComunicadoModel.create(req.body);
        res.status(201).json(newComunicado);
    } catch (error) { next(error); }
};

export const updateComunicado = async (req, res, next) => {
    try {
        const updatedComunicado = await ComunicadoModel.update(Number(req.params.id), req.body);
        res.json(updatedComunicado);
    } catch (error) { next(error); }
};

export const deleteComunicado = async (req, res, next) => {
    try {
        await ComunicadoModel.remove(Number(req.params.id));
        res.json({ message: 'Comunicado removido com sucesso' });
    } catch (error) { next(error); }
};
