import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const GatewayRuleModel = {
    getAll: async (id_tenant) => {
        return await prisma.gateway_rules.findMany({
            where: { id_tenant: id_tenant }
        });
    },

    getByMethod: async (method, id_tenant) => {
        const rule = await prisma.gateway_rules.findFirst({
            where: { 
                method: method,
                id_tenant: id_tenant
            }
        });
        return rule;
    },

    update: async (method, provider, isActive, id_tenant) => {
        return await prisma.gateway_rules.updateMany({
            where: { 
                method: method,
                id_tenant: id_tenant
            },
            data: { 
                provider: provider, 
                is_active: isActive,
                updated_at: new Date() 
            }
        });
    }
};

export default GatewayRuleModel;