import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const CarrosselModel = {
    // Busca todos (para o painel Admin)
    findAll: async (id_tenant) => prisma.carrossel_slides.findMany({ 
        where: { id_tenant: Number(id_tenant) },
        orderBy: { ordem: 'asc' } 
    }),
    
    // Busca apenas os ativos (para a vitrine pública)
    findAllActive: async (id_tenant) => prisma.carrossel_slides.findMany({ 
        where: { 
            ativo: true, 
            id_tenant: Number(id_tenant) 
        }, 
        orderBy: { ordem: 'asc' } 
    }),
    
    // Cria um novo slide garantindo o tenant correto
    create: async (data, id_tenant) => prisma.carrossel_slides.create({ 
        data: { 
            ...data, 
            id_tenant: Number(id_tenant) 
        } 
    }),
    
    // Atualiza e retorna o dado novo para o frontend não bugar
    update: async (id, data, id_tenant) => {
        // 1. Atualiza com segurança (garantindo que o slide pertence ao tenant)
        await prisma.carrossel_slides.updateMany({ 
            where: { 
                id_slide: Number(id), 
                id_tenant: Number(id_tenant) 
            }, 
            data 
        });

        // 2. Busca e retorna o item recém-atualizado
        return prisma.carrossel_slides.findFirst({
            where: { 
                id_slide: Number(id), 
                id_tenant: Number(id_tenant) 
            }
        });
    },
    
    // Remove com segurança
    remove: async (id, id_tenant) => prisma.carrossel_slides.deleteMany({ 
        where: { 
            id_slide: Number(id), 
            id_tenant: Number(id_tenant) 
        } 
    }),
};

export default CarrosselModel;