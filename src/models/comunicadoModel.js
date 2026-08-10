import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const ComunicadoModel = {
    findAll: async (id_tenant) => prisma.comunicados.findMany({ 
        where: { id_tenant: id_tenant },
        orderBy: { titulo: 'asc' } 
    }),
    findActive: async (id_tenant) => prisma.comunicados.findFirst({ 
        where: { ativo: true, id_tenant: id_tenant } 
    }),
    create: async (data, id_tenant) => prisma.comunicados.create({ 
        data: { ...data, id_tenant: id_tenant } 
    }),
    update: async (id, data, id_tenant) => prisma.comunicados.updateMany({ 
        where: { id_comunicado: id, id_tenant: id_tenant }, 
        data 
    }),
    remove: async (id, id_tenant) => prisma.comunicados.deleteMany({ 
        where: { id_comunicado: id, id_tenant: id_tenant } 
    }),
};

export default ComunicadoModel;