import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const BannerModel = {
    findAll: async () => prisma.banners_laterais.findMany({ orderBy: { titulo: 'asc' } }),
    findAllActive: async () => prisma.banners_laterais.findMany({ where: { ativo: true } }),
    create: async (data) => prisma.banners_laterais.create({ data }),
    update: async (id, data) => prisma.banners_laterais.update({ where: { id_banner: id }, data }),
    remove: async (id) => prisma.banners_laterais.delete({ where: { id_banner: id } }),
};

export default BannerModel;
