import Categoria from '../models/categoriaModel.js';

// ==========================================================
//                  FUNÇÃO AUXILIAR (Sanitização)
// ==========================================================

const formatarTexto = (texto) => {
    if (!texto) return '';
    return texto
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9 ]/g, "")
        .trim();
};

// ==========================================================
//                        CATEGORIAS
// ==========================================================

export const getAllCategorias = async (req, res, next) => {
    try {
        const categorias = await Categoria.findAll();
        return res.status(200).json(categorias);
    } catch (error) {
        next(error);
    }
};

export const createCategoria = async (req, res, next) => {
    try {
        const { nome } = req.body;

        if (!nome || typeof nome !== 'string' || !nome.trim()) {
            return res.status(400).json({ message: 'O nome da categoria é obrigatório.' });
        }

        const nomeLimpo = formatarTexto(nome);

        if (!nomeLimpo) {
            return res.status(400).json({ message: 'O nome da categoria contém apenas caracteres inválidos.' });
        }

        const novaCategoria = await Categoria.create(nomeLimpo);
        return res.status(201).json(novaCategoria);

    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(409).json({ message: 'Já existe uma categoria com este nome.' });
        }
        next(error);
    }
};

// ✅ NOVA FUNÇÃO: Editar Categoria
export const updateCategoria = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { nome } = req.body;

        if (!id) return res.status(400).json({ message: 'ID da categoria é obrigatório.' });
        
        const idNumero = Number(id);
        if (isNaN(idNumero)) return res.status(400).json({ message: 'ID inválido.' });

        if (!nome) return res.status(400).json({ message: 'O novo nome é obrigatório.' });

        const nomeLimpo = formatarTexto(nome);
        if (!nomeLimpo) return res.status(400).json({ message: 'Nome inválido.' });

        const categoriaAtualizada = await Categoria.update(idNumero, nomeLimpo);
        return res.status(200).json(categoriaAtualizada);

    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(409).json({ message: 'Já existe uma categoria com este nome.' });
        }
        if (error.code === 'P2025') {
            return res.status(404).json({ message: 'Categoria não encontrada.' });
        }
        next(error);
    }
};

export const deleteCategoria = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!id) return res.status(400).json({ message: 'ID da categoria é obrigatório.' });

        const idNumero = Number(id);
        if (isNaN(idNumero)) {
            return res.status(400).json({ message: 'ID inválido. Deve ser um número.' });
        }

        await Categoria.remove(idNumero);
        return res.status(200).json({ message: 'Categoria removida com sucesso.' });

    } catch (error) {
        if (error.code === 'P2003') {
            return res.status(400).json({ 
                message: 'Não é possível remover: existem registros vinculados (subcategorias ou produtos).' 
            });
        }
        if (error.code === 'P2025') {
            return res.status(404).json({ message: 'Categoria não encontrada.' });
        }
        next(error);
    }
};

// ==========================================================
//                  SUBCATEGORIAS
// ==========================================================

export const createSubcategoria = async (req, res, next) => {
    try {
        const { nome, id_categoria } = req.body;

        if (!nome || !id_categoria) {
            return res.status(400).json({ message: 'Nome da subcategoria e ID da categoria pai são obrigatórios.' });
        }

        const nomeLimpo = formatarTexto(nome);
        const idCategoriaNumero = Number(id_categoria);

        if (!nomeLimpo) {
            return res.status(400).json({ message: 'O nome da subcategoria contém apenas caracteres inválidos.' });
        }

        const novaSub = await Categoria.createSubcategoria(nomeLimpo, idCategoriaNumero);
        return res.status(201).json(novaSub);

    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(409).json({ message: 'Já existe uma subcategoria com este nome.' });
        }
        if (error.code === 'P2003') {
            return res.status(400).json({ message: 'A categoria pai informada não existe.' });
        }
        next(error);
    }
};

// ✅ NOVA FUNÇÃO: Editar Subcategoria
export const updateSubcategoria = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { nome, id_categoria } = req.body;

        if (!id) return res.status(400).json({ message: 'ID da subcategoria é obrigatório.' });

        const idNumero = Number(id);
        if (isNaN(idNumero)) return res.status(400).json({ message: 'ID inválido.' });

        const dadosParaAtualizar = {};

        // 1. Se enviou nome, sanitiza
        if (nome) {
            const nomeLimpo = formatarTexto(nome);
            if (!nomeLimpo) return res.status(400).json({ message: 'Nome inválido.' });
            dadosParaAtualizar.nome = nomeLimpo;
        }

        // 2. Se enviou nova categoria pai, converte para número
        if (id_categoria) {
            dadosParaAtualizar.id_categoria = Number(id_categoria);
        }

        if (Object.keys(dadosParaAtualizar).length === 0) {
            return res.status(400).json({ message: 'Nenhum dado enviado para atualização.' });
        }

        const subAtualizada = await Categoria.updateSubcategoria(idNumero, dadosParaAtualizar);
        return res.status(200).json(subAtualizada);

    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(409).json({ message: 'Já existe uma subcategoria com este nome.' });
        }
        if (error.code === 'P2003') {
            return res.status(400).json({ message: 'A categoria pai informada não existe.' });
        }
        if (error.code === 'P2025') {
            return res.status(404).json({ message: 'Subcategoria não encontrada.' });
        }
        next(error);
    }
};

export const deleteSubcategoria = async (req, res, next) => {
    try {
        const { id } = req.params;

        if (!id) return res.status(400).json({ message: 'ID da subcategoria é obrigatório.' });

        const idNumero = Number(id);

        if (isNaN(idNumero)) {
            return res.status(400).json({ message: 'ID inválido. Deve ser um número.' });
        }

        await Categoria.removeSubcategoria(idNumero);
        return res.status(200).json({ message: 'Subcategoria removida com sucesso.' });

    } catch (error) {
        if (error.code === 'P2003') {
            return res.status(400).json({ 
                message: 'Não é possível remover: existem produtos vinculados a esta subcategoria.' 
            });
        }
        if (error.code === 'P2025') {
            return res.status(404).json({ message: 'Subcategoria não encontrada.' });
        }
        next(error);
    }
};