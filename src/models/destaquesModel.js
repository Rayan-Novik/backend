import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const DestaquesModel = {
    findAll: async (id_tenant) => prisma.destaques_categorias.findMany({ 
        where: { id_tenant: Number(id_tenant) },
        orderBy: { ordem: 'asc' } 
    }),
    
    findAllActive: async (id_tenant) => prisma.destaques_categorias.findMany({ 
        where: { ativo: true, id_tenant: Number(id_tenant) }, 
        orderBy: { ordem: 'asc' } 
    }),
    
    create: async (data, id_tenant) => prisma.destaques_categorias.create({ 
        data: { ...data, id_tenant: Number(id_tenant) } 
    }),
    
    update: async (id, data, id_tenant) => {
        await prisma.destaques_categorias.updateMany({ 
            where: { id_destaque: Number(id), id_tenant: Number(id_tenant) }, 
            data 
        });
        return prisma.destaques_categorias.findFirst({
            where: { id_destaque: Number(id), id_tenant: Number(id_tenant) }
        });
    },
    
    remove: async (id, id_tenant) => prisma.destaques_categorias.deleteMany({ 
        where: { id_destaque: Number(id), id_tenant: Number(id_tenant) } 
    }),
};

export default DestaquesModel;