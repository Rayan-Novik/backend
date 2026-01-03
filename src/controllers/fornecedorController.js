import Fornecedor from '../models/fornecedorModel.js';

// @desc    Criar novo fornecedor (Homologação)
export const createFornecedor = async (req, res) => {
    try {
        const fornecedor = await Fornecedor.create(req.body);
        res.status(201).json(fornecedor);
    } catch (error) {
        console.error("Erro createFornecedor:", error.message);
        res.status(500).json({ message: 'Erro ao criar fornecedor no banco de dados.' });
    }
};

// @desc    Listar todos os fornecedores (Com contagem de produtos)
export const getAllFornecedores = async (req, res) => {
    try {
        const fornecedores = await Fornecedor.findAll();
        res.json(fornecedores);
    } catch (error) {
        console.error("Erro getAllFornecedores:", error.message);
        res.status(500).json({ message: 'Erro ao buscar fornecedores.' });
    }
};

// @desc    Buscar fornecedor por ID
export const getFornecedorById = async (req, res) => {
    try {
        const fornecedor = await Fornecedor.findById(Number(req.params.id));
        if (!fornecedor) {
            return res.status(404).json({ message: 'Fornecedor não encontrado.' });
        }
        res.json(fornecedor);
    } catch (error) {
        console.error("Erro getFornecedorById:", error.message);
        res.status(500).json({ message: 'Erro ao buscar fornecedor.' });
    }
};

// @desc    Atualizar fornecedor (Ficha completa)
export const updateFornecedor = async (req, res) => {
    try {
        const id = Number(req.params.id);
        
        // Verifica se o ID é válido antes de enviar ao Model
        if (isNaN(id)) {
            return res.status(400).json({ message: 'ID do fornecedor inválido.' });
        }

        const fornecedorAtualizado = await Fornecedor.update(id, req.body);
        res.json(fornecedorAtualizado);
    } catch (error) {
        console.error("Erro updateFornecedor:", error.message);
        res.status(500).json({ message: 'Erro ao atualizar dados do fornecedor.' });
    }
};

// @desc    Deletar fornecedor
export const deleteFornecedor = async (req, res) => {
    try {
        const id = Number(req.params.id);
        await Fornecedor.remove(id);
        res.json({ message: 'Fornecedor removido com sucesso.' });
    } catch (error) {
        console.error("Erro deleteFornecedor:", error.message);
        
        // Erro de restrição de chave estrangeira do Prisma (P2003)
        // Impede deletar fornecedor que tem produtos vinculados no banco
        if (error.code === 'P2003' || error.message.includes('Foreign key constraint')) {
            return res.status(400).json({ 
                message: 'Não é possível excluir este fornecedor pois existem produtos vinculados a ele. Tente alterar o status para "Suspenso" em vez de excluir.' 
            });
        }
        
        res.status(500).json({ message: 'Erro ao deletar fornecedor.' });
    }
};