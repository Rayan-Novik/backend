import DestaquesModel from '../models/destaquesModel.js';

// --- Rota Pública ---
export const getActiveDestaques = async (req, res, next) => {
    try {
        const destaques = await DestaquesModel.findAllActive();
        res.json(destaques);
    } catch (error) {
        next(error);
    }
};

// --- Rotas de Admin ---
export const getAllDestaques = async (req, res, next) => {
    try {
        const destaques = await DestaquesModel.findAll();
        res.json(destaques);
    } catch (error) {
        next(error);
    }
};

export const createDestaque = async (req, res, next) => {
    try {
        const { imagem_url, link_url, titulo, ativo, ordem } = req.body;
        const newDestaque = await DestaquesModel.create({ imagem_url, link_url, titulo, ativo, ordem });
        res.status(201).json(newDestaque);
    } catch (error) {
        next(error);
    }
};

export const updateDestaque = async (req, res, next) => {
    try {
        const updatedDestaque = await DestaquesModel.update(Number(req.params.id), req.body);
        res.json(updatedDestaque);
    } catch (error) {
        next(error);
    }
};

export const deleteDestaque = async (req, res, next) => {
    try {
        await DestaquesModel.remove(Number(req.params.id));
        res.json({ message: 'Destaque removido com sucesso' });
    } catch (error) {
        next(error);
    }
};
