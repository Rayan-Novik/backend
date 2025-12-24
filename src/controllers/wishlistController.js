import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * @desc    Obter a lista de desejos do utilizador logado
 * @route   GET /api/wishlist
 * @access  Private
 */
export const getWishlist = async (req, res, next) => {
    try {
        const userId = req.user.id_usuario;
        const wishlistItems = await prisma.lista_desejos.findMany({
            where: { id_usuario: userId },
            include: {
                produtos: { // Inclui os detalhes completos do produto
                    include: {
                        produto_subimagens: { // E a primeira imagem do produto
                            take: 1,
                            orderBy: { ordem: 'asc' }
                        }
                    }
                }
            }
        });
        res.json(wishlistItems);
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Adicionar um produto à lista de desejos
 * @route   POST /api/wishlist
 * @access  Private
 */
export const addToWishlist = async (req, res, next) => {
    try {
        const userId = req.user.id_usuario;
        const { productId } = req.body;

        // Verifica se o item já existe para não duplicar
        const existingItem = await prisma.lista_desejos.findFirst({
            where: { id_usuario: userId, id_produto: productId }
        });

        if (existingItem) {
            return res.status(400).json({ message: 'Produto já está na sua lista de desejos.' });
        }

        const wishlistItem = await prisma.lista_desejos.create({
            data: {
                id_usuario: userId,
                id_produto: productId,
            }
        });
        res.status(201).json(wishlistItem);
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Remover um produto da lista de desejos
 * @route   DELETE /api/wishlist/:productId
 * @access  Private
 */
export const removeFromWishlist = async (req, res, next) => {
    try {
        const userId = req.user.id_usuario;
        const { productId } = req.params;

        await prisma.lista_desejos.deleteMany({
            where: {
                id_usuario: userId,
                id_produto: Number(productId),
            }
        });
        res.json({ message: 'Produto removido da lista de desejos.' });
    } catch (error) {
        next(error);
    }
};
