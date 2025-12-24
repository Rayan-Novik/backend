import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const ComunicadoModel = {
    findAll: async () => prisma.comunicados.findMany({ orderBy: { titulo: 'asc' } }),
    findActive: async () => prisma.comunicados.findFirst({ where: { ativo: true } }),
    create: async (data) => prisma.comunicados.create({ data }),
    update: async (id, data) => prisma.comunicados.update({ where: { id_comunicado: id }, data }),
    remove: async (id) => prisma.comunicados.delete({ where: { id_comunicado: id } }),
};

export default ComunicadoModel;
