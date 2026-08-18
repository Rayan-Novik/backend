import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const FreteModel = {
    getSettings: async (id_tenant) => {
        return prisma.configuracoes_frete.findMany({
            where: { id_tenant: id_tenant }
        });
    },

    updateSetting: async (chave, valor, id_tenant) => {
        const existing = await prisma.configuracoes_frete.findFirst({
            where: { 
                chave: chave,
                id_tenant: id_tenant
            }
        });

        if (existing) {
            return prisma.configuracoes_frete.updateMany({
                where: { 
                    chave: chave,
                    id_tenant: id_tenant
                },
                data: { valor: valor }
            });
        } else {
            return prisma.configuracoes_frete.create({
                data: { 
                    chave: chave, 
                    valor: valor,
                    id_tenant: id_tenant
                }
            });
        }
    },
};

export default FreteModel;