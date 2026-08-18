import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const BannerModel = {
    findAll: async (id_tenant) => prisma.banners_laterais.findMany({ 
        where: { id_tenant: id_tenant },
        orderBy: { titulo: 'asc' } 
    }),
    
    findAllActive: async (id_tenant) => prisma.banners_laterais.findMany({ 
        where: { ativo: true, id_tenant: id_tenant } 
    }),
    
    create: async (data, id_tenant) => prisma.banners_laterais.create({ 
        data: { ...data, id_tenant: id_tenant } 
    }),
    
    update: async (id, data, id_tenant) => prisma.banners_laterais.updateMany({ 
        where: { id_banner: id, id_tenant: id_tenant }, 
        data 
    }),
    
    remove: async (id, id_tenant) => prisma.banners_laterais.deleteMany({ 
        where: { id_banner: id, id_tenant: id_tenant } 
    }),
};

export default BannerModel;