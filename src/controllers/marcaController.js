import MarcaModel from '../models/marcaModel.js';

// @desc    Buscar todas as marcas
// @route   GET /api/marcas
// @access  Public (para os formulários) / Admin (para a gestão)
export const getAllMarcas = async (req, res, next) => {
  try {
    const marcas = await MarcaModel.findAll();
    res.status(200).json(marcas);
  } catch (error) {
    next(error);
  }
};

// @desc    Criar uma nova marca (Admin)
export const createMarca = async (req, res, next) => {
    try {
        const novaMarca = await MarcaModel.create(req.body);
        res.status(201).json(novaMarca);
    } catch (error) {
        next(error);
    }
};

// @desc    Atualizar uma marca (Admin)
export const updateMarca = async (req, res, next) => {
    try {
        const marcaAtualizada = await MarcaModel.update(Number(req.params.id), req.body);
        res.json(marcaAtualizada);
    } catch (error) {
        next(error);
    }
};

// @desc    Apagar uma marca (Admin)
export const deleteMarca = async (req, res, next) => {
    try {
        await MarcaModel.remove(Number(req.params.id));
        res.json({ message: 'Marca removida com sucesso' });
    } catch (error) {
        next(error);
    }
};
