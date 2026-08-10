import AvaliacaoModel from '../models/avaliacaoModel.js';
import { PrismaClient } from '@prisma/client'; // 📦 Importamos o Prisma só para descobrir o ID real

const prisma = new PrismaClient();

export const getProductReviews = async (req, res, next) => {
    try {
        const parametro = req.params.id;
        let productId;

        // 1. Verifica se já é um número direto
        if (!isNaN(parametro)) {
            productId = Number(parametro);
        } else {
            // 2. Tenta achar pelo slug no banco de dados
            const produtoPorSlug = await prisma.produtos.findFirst({
                where: {
                    slug: parametro,
                    id_tenant: req.tenantId
                },
                select: { id_produto: true }
            });

            if (produtoPorSlug) {
                productId = produtoPorSlug.id_produto;
            } else {
                // 3. Fallback: extrai o ID do final do texto (ex: degrade-34 -> 34)
                const parts = parametro.split('-');
                const potentialId = parts[parts.length - 1];

                if (!isNaN(potentialId)) {
                    productId = Number(potentialId);
                } else {
                    return res.status(400).json({ message: 'URL inválida para buscar avaliações.' });
                }
            }
        }

        // 🟢 Agora sim! Passamos o productId (que é 100% numérico) para o seu Model
        const reviews = await AvaliacaoModel.findByProductId(productId, req.tenantId);
        res.json(reviews);
    } catch (error) {
        next(error);
    }
};

export const createProductReview = async (req, res, next) => {
    try {
        const { nota, comentario, imagem_url } = req.body;
        const parametro = req.params.id;
        let productId;

        // 🕵️ Repetimos a lógica rápida aqui caso o usuário tente avaliar usando a URL com slug
        if (!isNaN(parametro)) {
            productId = Number(parametro);
        } else {
            const parts = parametro.split('-');
            productId = Number(parts[parts.length - 1]);
        }

        const id_usuario = req.user.id_usuario;

        const jaAvaliou = await AvaliacaoModel.checkIfUserReviewed(id_usuario, productId, req.tenantId);
        if (jaAvaliou) {
            res.status(400);
            throw new Error('Você já avaliou este produto nesta loja.');
        }

        await AvaliacaoModel.create({
            nota: Number(nota),
            comentario,
            imagem_url,
            id_produto: productId, // 🟢 Usando o ID tratado
            id_usuario,
            id_tenant: req.tenantId // 🛡️ BLINDAGEM SAAS
        });

        res.status(201).json({ message: 'Avaliação adicionada com sucesso!' });

    } catch (error) {
        next(error);
    }
};

export const getAdminReviews = async (req, res, next) => {
    try {
        const reviews = await AvaliacaoModel.findAll(req.tenantId);
        res.json(reviews);
    } catch (error) {
        next(error);
    }
};

export const replyReview = async (req, res, next) => {
    try {
        const { resposta } = req.body;
        const { id } = req.params;

        if (!resposta) {
            res.status(400);
            throw new Error('O texto da resposta é obrigatório');
        }

        const updatedReview = await AvaliacaoModel.reply(id, resposta, req.tenantId);
        res.json(updatedReview);
    } catch (error) {
        next(error);
    }
};

