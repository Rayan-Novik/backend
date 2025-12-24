import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const DestaquesModel = {
    // Para o admin ver todos os destaques
    findAll: async () => prisma.destaques_categorias.findMany({ orderBy: { ordem: 'asc' } }),
    // Para o e-commerce buscar apenas os destaques ativos
    findAllActive: async () => prisma.destaques_categorias.findMany({ where: { ativo: true }, orderBy: { ordem: 'asc' } }),
    // Funções de gestão para o admin
    create: async (data) => prisma.destaques_categorias.create({ data }),
    update: async (id, data) => prisma.destaques_categorias.update({ where: { id_destaque: id }, data }),
    remove: async (id) => prisma.destaques_categorias.delete({ where: { id_destaque: id } }),
};

export default DestaquesModel;
