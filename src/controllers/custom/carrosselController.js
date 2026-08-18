import CarrosselModel from '../../models/carrosselModel.js';

export const getActiveSlides = async (req, res, next) => {
    try {
        const slides = await CarrosselModel.findAllActive(req.tenantId);
        res.json(slides);
    } catch (error) {
        next(error);
    }
};

export const getAllSlides = async (req, res, next) => {
    try {
        const slides = await CarrosselModel.findAll(req.tenantId);
        res.json(slides);
    } catch (error) {
        next(error);
    }
};

export const createSlide = async (req, res, next) => {
    try {
        // Pega apenas os dados que existem na tabela
        const { imagem_url, link_url, titulo, subtitulo, ativo, ordem } = req.body;
        
        const newSlide = await CarrosselModel.create(
            { imagem_url, link_url, titulo, subtitulo, ativo, ordem }, 
            req.tenantId
        );
        res.status(201).json(newSlide);
    } catch (error) {
        next(error);
    }
};

export const updateSlide = async (req, res, next) => {
    try {
        // 🟢 CORREÇÃO AQUI: Filtramos o req.body para ignorar o 'tipo_filtro' e 'valor_filtro'
        const { imagem_url, link_url, titulo, subtitulo, ativo, ordem } = req.body;
        
        const updatedSlide = await CarrosselModel.update(
            Number(req.params.id), 
            { imagem_url, link_url, titulo, subtitulo, ativo, ordem }, 
            req.tenantId
        );
        
        res.json(updatedSlide);
    } catch (error) {
        next(error);
    }
};

export const deleteSlide = async (req, res, next) => {
    try {
        await CarrosselModel.remove(Number(req.params.id), req.tenantId);
        res.json({ message: 'Slide removido com sucesso' });
    } catch (error) {
        next(error);
    }
};