import AvaliacaoModel from '../models/avaliacaoModel.js';
// import PedidoModel from '../models/pedidoModel.js'; 

// @desc    Buscar todas as avaliações de um produto
// @route   GET /api/produtos/:id/reviews
// @access  Public
export const getProductReviews = async (req, res, next) => {
    try {
        const reviews = await AvaliacaoModel.findByProductId(Number(req.params.id));
        res.json(reviews);
    } catch (error) {
        next(error);
    }
};

// @desc    Criar uma nova avaliação
// @route   POST /api/produtos/:id/reviews
// @access  Private
export const createProductReview = async (req, res, next) => {
    try {
        // Agora extraímos também a imagem_url do body
        const { nota, comentario, imagem_url } = req.body;
        const id_produto = Number(req.params.id);
        const id_usuario = req.user.id_usuario;

        // Verifica se o utilizador já avaliou este produto
        const jaAvaliou = await AvaliacaoModel.checkIfUserReviewed(id_usuario, id_produto);
        if (jaAvaliou) {
            res.status(400);
            throw new Error('Você já avaliou este produto.');
        }

        // (Lógica opcional de verificação de compra removida para brevidade, mas pode manter aqui)

        await AvaliacaoModel.create({
            nota: Number(nota),
            comentario,
            imagem_url, // Passa a URL da imagem para o model
            id_produto,
            id_usuario,
        });

        res.status(201).json({ message: 'Avaliação adicionada com sucesso!' });

    } catch (error) {
        next(error);
    }
};

// --- NOVAS FUNÇÕES ADMIN ---

// @desc    Admin: Buscar TODAS as avaliações do sistema
// @route   GET /api/avaliacoes/admin/all
// @access  Private/Admin
export const getAdminReviews = async (req, res, next) => {
    try {
        const reviews = await AvaliacaoModel.findAll();
        res.json(reviews);
    } catch (error) {
        next(error);
    }
};

// @desc    Admin: Responder uma avaliação
// @route   PUT /api/avaliacoes/admin/:id/reply
// @access  Private/Admin
export const replyReview = async (req, res, next) => {
    try {
        const { resposta } = req.body;
        const { id } = req.params; // ID da avaliação

        if (!resposta) {
            res.status(400);
            throw new Error('O texto da resposta é obrigatório');
        }

        const updatedReview = await AvaliacaoModel.reply(id, resposta);
        res.json(updatedReview);
    } catch (error) {
        next(error);
    }
};