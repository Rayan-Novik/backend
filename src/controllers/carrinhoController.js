import CarrinhoModel from '../models/carrinhoModel.js';

export const getCarrinho = async (req, res) => {
    try {
        const id_usuario = req.user.id_usuario;
        const carrinhoItens = await CarrinhoModel.findByUserId(id_usuario, req.tenantId);

        if (!carrinhoItens || carrinhoItens.length === 0) {
            return res.status(200).json([]); // Retorna array vazio em vez de erro 400
        }

        const carrinhoFormatado = [];

        // 🟢 BUSCA AS VARIAÇÕES MANUAIS NO BANCO
        for (const item of carrinhoItens) {
            let variacaoObj = null;

            if (item.id_variacao) {
                variacaoObj = await prisma.produto_variacoes.findUnique({
                    where: { id_variacao: Number(item.id_variacao) }
                });
            }

            carrinhoFormatado.push({
                id_produto: item.produtos.id_produto,
                nome: item.produtos.nome,
                preco: variacaoObj && variacaoObj.preco_adicional > 0 
                       ? Number(item.produtos.preco) + Number(variacaoObj.preco_adicional) 
                       : item.produtos.preco,
                imagem_url: variacaoObj?.imagem_url || item.produtos.imagem_url,
                quantidade: parseFloat(item.quantidade),
                unidade: item.produtos.unidade,
                id_variacao: variacaoObj ? variacaoObj.id_variacao : null,
                cor: variacaoObj ? variacaoObj.cor : null,
                tamanho: variacaoObj ? variacaoObj.tamanho : null
            });
        }

        res.status(200).json(carrinhoFormatado);
    } catch (error) {
        res.status(500).json({ message: "Erro ao buscar o carrinho.", error: error.message });
    }
};

export const addAoCarrinho = async (req, res) => {
    try {
        const id_usuario = req.user.id_usuario;
        const { id_produto, quantidade, id_variacao } = req.body;

        if (!id_produto || !quantidade || Number(quantidade) <= 0) {
            return res.status(400).json({ message: "ID do produto e quantidade válida são obrigatórios." });
        }

        await CarrinhoModel.addOrUpdate(id_usuario, id_produto, quantidade, req.tenantId, id_variacao);
        res.status(201).json({ message: "Produto adicionado ao carrinho com sucesso!" });
    } catch (error) {
        res.status(500).json({ message: "Erro ao adicionar produto ao carrinho.", error: error.message });
    }
};

export const atualizarQuantidade = async (req, res) => {
    try {
        const id_usuario = req.user.id_usuario;
        const { id_produto, quantidade } = req.body;

        if (!id_produto || quantidade === undefined || Number(quantidade) <= 0) {
            return res.status(400).json({ message: "Dados inválidos." });
        }

        await CarrinhoModel.updateQuantity(id_usuario, id_produto, quantidade, req.tenantId);
        res.status(200).json({ message: "Quantidade atualizada com sucesso" });
    } catch (error) {
        console.error("Erro update:", error);
        res.status(500).json({ message: "Erro ao atualizar quantidade", error: error.message });
    }
};

export const removerDoCarrinho = async (req, res) => {
    try {
        const id_usuario = req.user.id_usuario;
        const { id_produto } = req.params;

        await CarrinhoModel.remove(id_usuario, Number(id_produto), req.tenantId);
        res.status(200).json({ message: 'Item removido com sucesso' });
    } catch (error) {
        res.status(500).json({ message: "Erro ao remover item.", error: error.message });
    }
};