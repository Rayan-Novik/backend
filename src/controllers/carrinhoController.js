import CarrinhoModel from '../models/carrinhoModel.js';

export const getCarrinho = async (req, res) => {
    try {
        const id_usuario = req.user.id_usuario;
        const carrinhoItens = await CarrinhoModel.findByUserId(id_usuario);

        // O Prisma retorna os produtos aninhados. Vamos formatar para o frontend.
        const carrinhoFormatado = carrinhoItens.map(item => ({
            id_produto: item.produtos.id_produto,
            nome: item.produtos.nome,
            preco: item.produtos.preco,
            imagem_url: item.produtos.imagem_url,
            quantidade: item.quantidade,
        }));

        res.status(200).json(carrinhoFormatado);
    } catch (error) {
        res.status(500).json({ message: "Erro ao buscar o carrinho.", error: error.message });
    }
};

export const addAoCarrinho = async (req, res) => {
    try {
        const id_usuario = req.user.id_usuario;
        const { id_produto, quantidade } = req.body;

        if (!id_produto || !quantidade || quantidade <= 0) {
            return res.status(400).json({ message: "ID do produto e quantidade são obrigatórios." });
        }

        await CarrinhoModel.addOrUpdate(id_usuario, id_produto, quantidade);
        res.status(201).json({ message: "Produto adicionado ao carrinho com sucesso!" });
    } catch (error) {
        res.status(500).json({ message: "Erro ao adicionar produto ao carrinho.", error: error.message });
    }
};

export const removerDoCarrinho = async (req, res) => {
    try {
        const id_usuario = req.user.id_usuario;
        const { id_produto } = req.params;
        
        await CarrinhoModel.remove(id_usuario, Number(id_produto));
        res.status(200).json({ message: 'Item removido com sucesso' });
    } catch (error) {
        res.status(500).json({ message: "Erro ao remover item.", error: error.message });
    }
}
