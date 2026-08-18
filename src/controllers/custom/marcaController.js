import MarcaModel from '../../models/marcaModel.js';

export const getAllMarcas = async (req, res, next) => {
  try {
    const marcas = await MarcaModel.findAll(req.tenantId);
    res.status(200).json(marcas);
  } catch (error) {
    next(error);
  }
};

export const createMarca = async (req, res, next) => {
    try {
        const novaMarca = await MarcaModel.create(req.body, req.tenantId);
        res.status(201).json(novaMarca);
    } catch (error) {
        next(error);
    }
};

export const updateMarca = async (req, res, next) => {
    try {
        const marcaAtualizada = await MarcaModel.update(Number(req.params.id), req.body, req.tenantId);
        res.json(marcaAtualizada);
    } catch (error) {
        next(error);
    }
};

export const deleteMarca = async (req, res, next) => {
    try {
        await MarcaModel.remove(Number(req.params.id), req.tenantId);
        res.json({ message: 'Marca removida com sucesso' });
    } catch (error) {
        next(error);
    }
};