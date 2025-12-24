import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const MarcaModel = {
    // Busca todas as marcas
    findAll: async () => {
        return prisma.marcas.findMany({
            orderBy: { nome: 'asc' }
        });
    },
    // Cria uma nova marca
    create: async (data) => {
        return prisma.marcas.create({ data });
    },
    // Atualiza uma marca existente
    update: async (id, data) => {
        return prisma.marcas.update({
            where: { id_marca: id },
            data
        });
    },
    // Apaga uma marca
    remove: async (id) => {
        return prisma.marcas.delete({
            where: { id_marca: id }
        });
    },
};

export default MarcaModel;
