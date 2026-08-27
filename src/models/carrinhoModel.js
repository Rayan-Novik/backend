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

    // 🟢 ADICIONADO complementos e observacao como argumentos
    async addOrUpdate(id_usuario, id_produto, quantidade, id_tenant, id_variacao = null, complementos = null, observacao = null) {
        try {
            // 🟢 PREPARA OS DADOS PARA O PRISMA
            let complementosJson = [];
            if (complementos) {
                try {
                    complementosJson = typeof complementos === 'string' ? JSON.parse(complementos) : complementos;
                } catch (e) {
                    complementosJson = [];
                }
            }
            const obsStr = observacao || null;

            const itemExistente = await prisma.carrinhos.findFirst({
                where: {
                    id_usuario: Number(id_usuario),
                    id_produto: Number(id_produto),
                    id_tenant: Number(id_tenant),
                    id_variacao: id_variacao ? Number(id_variacao) : null,
                    observacao: obsStr,
                    // Garante que só vai somar a quantidade se os complementos forem EXATAMENTE iguais
                    complementos: { equals: complementosJson } 
                }
            });

            if (itemExistente) {
                return await prisma.carrinhos.updateMany({
                    where: {
                        id_usuario: Number(id_usuario),
                        id_produto: Number(id_produto),
                        id_tenant: Number(id_tenant),
                        id_variacao: id_variacao ? Number(id_variacao) : null,
                        observacao: obsStr,
                        complementos: { equals: complementosJson }
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
                    id_variacao: id_variacao ? Number(id_variacao) : null,
                    // 🟢 SALVANDO EXPLICITAMENTE NO BANCO
                    complementos: complementosJson,
                    observacao: obsStr
                },
            });
        } catch (error) {
            console.error("❌ ERRO GRAVE AO SALVAR NO CARRINHO:", error);
            throw error; 
        }
    },

    async updateQuantity(id_usuario, id_produto, quantidade, id_tenant, id_variacao = null, complementos = null, observacao = null) {
        let complementosJson = [];
        if (complementos) {
            try { complementosJson = typeof complementos === 'string' ? JSON.parse(complementos) : complementos; } catch (e) {}
        }
        const obsStr = observacao || null;

        return prisma.carrinhos.updateMany({
            where: {
                id_usuario: Number(id_usuario),
                id_produto: Number(id_produto),
                id_tenant: Number(id_tenant),
                id_variacao: id_variacao ? Number(id_variacao) : null,
                observacao: obsStr,
                complementos: { equals: complementosJson }
            },
            data: {
                quantidade: Number(quantidade)
            }
        });
    },

    async remove(id_usuario, id_produto, id_tenant, id_variacao = null, complementos = null, observacao = null) {
        let complementosJson = [];
        if (complementos) {
            try { complementosJson = typeof complementos === 'string' ? JSON.parse(complementos) : complementos; } catch (e) {}
        }
        const obsStr = observacao || null;

        return prisma.carrinhos.deleteMany({
            where: {
                id_usuario: Number(id_usuario),
                id_produto: Number(id_produto), 
                id_tenant: Number(id_tenant),
                id_variacao: id_variacao ? Number(id_variacao) : null,
                observacao: obsStr,
                complementos: { equals: complementosJson }
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