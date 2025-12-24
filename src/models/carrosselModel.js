import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CarrosselModel = {
    // Para o admin ver todos os slides
    findAll: async () => prisma.carrossel_slides.findMany({ orderBy: { ordem: 'asc' } }),
    // Para o e-commerce buscar apenas os slides ativos
    findAllActive: async () => prisma.carrossel_slides.findMany({ where: { ativo: true }, orderBy: { ordem: 'asc' } }),
    // Funções de gestão para o admin
    create: async (data) => prisma.carrossel_slides.create({ data }),
    update: async (id, data) => prisma.carrossel_slides.update({ where: { id_slide: id }, data }),
    remove: async (id) => prisma.carrossel_slides.delete({ where: { id_slide: id } }),
};

export default CarrosselModel;
