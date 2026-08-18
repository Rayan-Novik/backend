import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const MarcaModel = {
    findAll: async (id_tenant) => {
        return prisma.marcas.findMany({
            where: { id_tenant: id_tenant },
            orderBy: { nome: 'asc' }
        });
    },

    create: async (data, id_tenant) => {
        return prisma.marcas.create({ 
            data: { ...data, id_tenant: id_tenant } 
        });
    },

    update: async (id, data, id_tenant) => {
        return prisma.marcas.updateMany({
            where: { 
                id_marca: id, 
                id_tenant: id_tenant 
            },
            data
        });
    },

    remove: async (id, id_tenant) => {
        return prisma.marcas.deleteMany({
            where: { 
                id_marca: id, 
                id_tenant: id_tenant 
            }
        });
    },
};

export default MarcaModel;