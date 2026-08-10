import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const Cupom = {
    create: async (data) => {
        return prisma.cupons_desconto.create({ data });
    },

    findAll: async (id_tenant) => {
        return prisma.cupons_desconto.findMany({
            where: { id_tenant: id_tenant },
            include: {
                produtos: { select: { nome: true } }, 
                categorias: { select: { nome: true } },
                marcas: { select: { nome: true } }
            },
            orderBy: { id_cupom: 'desc' }
        });
    },

    findByCode: async (codigo, id_tenant) => {
        return prisma.cupons_desconto.findFirst({
            where: { 
                codigo: codigo,
                id_tenant: id_tenant 
            }
        });
    },

    findById: async (id, id_tenant) => {
        return prisma.cupons_desconto.findFirst({
            where: { 
                id_cupom: id,
                id_tenant: id_tenant 
            }
        });
    },

    incrementUsage: async (id, id_tenant) => {
        return prisma.cupons_desconto.updateMany({
            where: { 
                id_cupom: id,
                id_tenant: id_tenant 
            },
            data: { usos_atuais: { increment: 1 } }
        });
    },

    update: async (id, data, id_tenant) => {
        return prisma.cupons_desconto.updateMany({
            where: { 
                id_cupom: id,
                id_tenant: id_tenant 
            },
            data
        });
    },

    delete: async (id, id_tenant) => {
        return prisma.cupons_desconto.deleteMany({
            where: { 
                id_cupom: id,
                id_tenant: id_tenant 
            }
        });
    }
};

export default Cupom;