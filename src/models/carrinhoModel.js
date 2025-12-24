import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export default {
    async findByUserId(id_usuario) {
        // O Prisma permite fazer 'JOINs' de forma simples com 'include'
        return prisma.carrinhos.findMany({
            where: { id_usuario: id_usuario },
            include: {
                produtos: true, // Inclui os dados do produto relacionado
            },
        });
    },

    async addOrUpdate(id_usuario, id_produto, quantidade) {
        // A lógica de 'INSERT ... ON DUPLICATE KEY UPDATE' é feita com 'upsert'
        return prisma.carrinhos.upsert({
            where: {
                // Define a chave única para encontrar o item
                id_usuario_id_produto: {
                    id_usuario: id_usuario,
                    id_produto: id_produto,
                }
            },
            update: {
                // Se encontrar, atualiza a quantidade
                quantidade: {
                    increment: quantidade,
                },
            },
            create: {
                // Se não encontrar, cria um novo item
                id_usuario: id_usuario,
                id_produto: id_produto,
                quantidade: quantidade,
            },
        });
    },

    async remove(id_usuario, id_produto) {
        return prisma.carrinhos.deleteMany({
            where: {
                id_usuario: id_usuario,
                id_produto: id_produto,
            },
        });
    },

    async clear(id_usuario) {
        return prisma.carrinhos.deleteMany({
            where: { id_usuario: id_usuario },
        });
    }
};
