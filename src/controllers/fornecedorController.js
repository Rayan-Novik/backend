import Fornecedor from '../models/fornecedorModel.js';

export const createFornecedor = async (req, res) => {
    try {
        const fornecedor = await Fornecedor.create(req.body, req.tenantId);
        res.status(201).json(fornecedor);
    } catch (error) {
        console.error("Erro createFornecedor:", error.message);
        res.status(500).json({ message: 'Erro ao criar fornecedor no banco de dados.' });
    }
};

export const getAllFornecedores = async (req, res) => {
    try {
        const fornecedores = await Fornecedor.findAll(req.tenantId);
        res.json(fornecedores);
    } catch (error) {
        console.error("Erro getAllFornecedores:", error.message);
        res.status(500).json({ message: 'Erro ao buscar fornecedores.' });
    }
};

export const getFornecedorById = async (req, res) => {
    try {
        const fornecedor = await Fornecedor.findById(Number(req.params.id), req.tenantId);
        if (!fornecedor) {
            return res.status(404).json({ message: 'Fornecedor não encontrado nesta loja.' });
        }
        res.json(fornecedor);
    } catch (error) {
        console.error("Erro getFornecedorById:", error.message);
        res.status(500).json({ message: 'Erro ao buscar fornecedor.' });
    }
};

export const updateFornecedor = async (req, res) => {
    try {
        const id = Number(req.params.id);
        
        if (isNaN(id)) {
            return res.status(400).json({ message: 'ID do fornecedor inválido.' });
        }

        const fornecedorAtualizado = await Fornecedor.update(id, req.body, req.tenantId);
        res.json(fornecedorAtualizado);
    } catch (error) {
        console.error("Erro updateFornecedor:", error.message);
        res.status(500).json({ message: 'Erro ao atualizar dados do fornecedor.' });
    }
};

export const deleteFornecedor = async (req, res) => {
    try {
        const id = Number(req.params.id);
        await Fornecedor.remove(id, req.tenantId);
        res.json({ message: 'Fornecedor removido com sucesso.' });
    } catch (error) {
        console.error("Erro deleteFornecedor:", error.message);
        
        if (error.code === 'P2003' || error.message.includes('Foreign key constraint')) {
            return res.status(400).json({ 
                message: 'Não é possível excluir este fornecedor pois existem produtos vinculados a ele. Tente alterar o status para "Suspenso" em vez de excluir.' 
            });
        }
        
        res.status(500).json({ message: 'Erro ao deletar fornecedor.' });
    }
};