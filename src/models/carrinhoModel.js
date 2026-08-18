import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export default {
    async findByUserId(id_usuario, id_tenant) {
        return prisma.carrinhos.findMany({
            where: { 
                id_usuario: Number(id_usuario), 
                id_tenant: Number(id_tenant) 
            },
            include: {
                produtos: true, 
            },
        });
    },

    // 🟢 ADICIONADO id_variacao como argumento
    async addOrUpdate(id_usuario, id_produto, quantidade, id_tenant, id_variacao = null) {
        try {
            const itemExistente = await prisma.carrinhos.findFirst({
                where: {
                    id_usuario: Number(id_usuario),
                    id_produto: Number(id_produto),
                    id_tenant: Number(id_tenant),
                    id_variacao: id_variacao ? Number(id_variacao) : null
                }
            });

            if (itemExistente) {
                // 🟢 Usamos updateMany para blindar contra erros de nome da chave primária (id vs id_carrinho)
                return await prisma.carrinhos.updateMany({
                    where: {
                        id_usuario: Number(id_usuario),
                        id_produto: Number(id_produto),
                        id_tenant: Number(id_tenant),
                        id_variacao: id_variacao ? Number(id_variacao) : null
                    },
                    data: {
                        quantidade: { increment: Number(quantidade) },
                    },
                });
            }

            return await prisma.carrinhos.create({
                data: {
                    id_usuario: Number(id_usuario),
                    id_produto: Number(id_produto),
                    id_tenant: Number(id_tenant),
                    quantidade: Number(quantidade),
                    id_variacao: id_variacao ? Number(id_variacao) : null
                },
            });
        } catch (error) {
            console.error("❌ ERRO GRAVE AO SALVAR NO CARRINHO:", error);
            throw error; // Repassa o erro para o controller
        }
    },

    async updateQuantity(id_usuario, id_produto, quantidade, id_tenant) {
        return prisma.carrinhos.updateMany({
            where: {
                id_usuario: Number(id_usuario),
                id_produto: Number(id_produto),
                id_tenant: Number(id_tenant)
            },
            data: {
                quantidade: Number(quantidade)
            }
        });
    },

    async remove(id_usuario, id_produto, id_tenant) {
        return prisma.carrinhos.deleteMany({
            where: {
                id_usuario: Number(id_usuario),
                id_produto: Number(id_produto), 
                id_tenant: Number(id_tenant)
            },
        });
    },

    async clear(id_usuario, id_tenant) {
        return prisma.carrinhos.deleteMany({
            where: { 
                id_usuario: Number(id_usuario),
                id_tenant: Number(id_tenant) 
            },
        });
    }
};