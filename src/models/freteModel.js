import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const FreteModel = {
    // Busca todas as configurações de frete
    getSettings: async () => {
        return prisma.configuracoes_frete.findMany();
    },
    // Atualiza uma configuração de frete
    updateSetting: async (chave, valor) => {
        return prisma.configuracoes_frete.upsert({
            where: { chave: chave }, // Como encontrar o registo
            update: { valor: valor }, // O que fazer se encontrar
            create: { chave: chave, valor: valor }, // O que fazer se NÃO encontrar
        });
    },
};

export default FreteModel;
