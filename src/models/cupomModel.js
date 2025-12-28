import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const Cupom = {
    create: async (data) => {
        return prisma.cupons_desconto.create({ data });
    },

    findAll: async () => {
        return prisma.cupons_desconto.findMany({
            include: {
                produtos: { select: { nome: true } }, // Para mostrar o nome do produto alvo na lista
                categorias: { select: { nome: true } },
                marcas: { select: { nome: true } }
            },
            orderBy: { id_cupom: 'desc' }
        });
    },

    findByCode: async (codigo) => {
        return prisma.cupons_desconto.findUnique({
            where: { codigo: codigo }
        });
    },

    findById: async (id) => {
        return prisma.cupons_desconto.findUnique({
            where: { id_cupom: id }
        });
    },

    // Função para incrementar uso (Chamar ao finalizar pedido)
    incrementUsage: async (id) => {
        return prisma.cupons_desconto.update({
            where: { id_cupom: id },
            data: { usos_atuais: { increment: 1 } }
        });
    },

    update: async (id, data) => {
        return prisma.cupons_desconto.update({
            where: { id_cupom: id },
            data
        });
    },

    delete: async (id) => {
        return prisma.cupons_desconto.delete({
            where: { id_cupom: id }
        });
    }
};

export default Cupom;