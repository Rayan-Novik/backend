import CarrosselModel from '../models/carrosselModel.js';

// --- Rota Pública ---
export const getActiveSlides = async (req, res, next) => {
    try {
        const slides = await CarrosselModel.findAllActive();
        res.json(slides);
    } catch (error) {
        next(error);
    }
};

// --- Rotas de Admin ---
export const getAllSlides = async (req, res, next) => {
    try {
        const slides = await CarrosselModel.findAll();
        res.json(slides);
    } catch (error) {
        next(error);
    }
};

export const createSlide = async (req, res, next) => {
    try {
        const { imagem_url, link_url, titulo, subtitulo, ativo, ordem } = req.body;
        const newSlide = await CarrosselModel.create({ imagem_url, link_url, titulo, subtitulo, ativo, ordem });
        res.status(201).json(newSlide);
    } catch (error) {
        next(error);
    }
};

export const updateSlide = async (req, res, next) => {
    try {
        const updatedSlide = await CarrosselModel.update(Number(req.params.id), req.body);
        res.json(updatedSlide);
    } catch (error) {
        next(error);
    }
};

export const deleteSlide = async (req, res, next) => {
    try {
        await CarrosselModel.remove(Number(req.params.id));
        res.json({ message: 'Slide removido com sucesso' });
    } catch (error) {
        next(error);
    }
};
