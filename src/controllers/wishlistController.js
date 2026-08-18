import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const getWishlist = async (req, res, next) => {
    try {
        const userId = req.user.id_usuario;
        const id_tenant = req.tenantId;

        const wishlistItems = await prisma.lista_desejos.findMany({
            where: { 
                id_usuario: userId,
                id_tenant: id_tenant 
            },
            include: {
                produtos: { 
                    include: {
                        produto_subimagens: { 
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

export const addToWishlist = async (req, res, next) => {
    try {
        const userId = req.user.id_usuario;
        const id_tenant = req.tenantId;
        const { productId } = req.body;

        const existingItem = await prisma.lista_desejos.findFirst({
            where: { 
                id_usuario: userId, 
                id_produto: productId,
                id_tenant: id_tenant
            }
        });

        if (existingItem) {
            return res.status(400).json({ message: 'Produto já está na sua lista de desejos.' });
        }

        const wishlistItem = await prisma.lista_desejos.create({
            data: {
                id_usuario: userId,
                id_produto: productId,
                id_tenant: id_tenant
            }
        });
        res.status(201).json(wishlistItem);
    } catch (error) {
        next(error);
    }
};

export const removeFromWishlist = async (req, res, next) => {
    try {
        const userId = req.user.id_usuario;
        const id_tenant = req.tenantId;
        const { productId } = req.params;

        await prisma.lista_desejos.deleteMany({
            where: {
                id_usuario: userId,
                id_produto: Number(productId),
                id_tenant: id_tenant
            }
        });
        res.json({ message: 'Produto removido da lista de desejos.' });
    } catch (error) {
        next(error);
    }
};