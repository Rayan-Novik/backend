import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const Fornecedor = {
    create: async (data, id_tenant) => {
        return prisma.fornecedores.create({
            data: {
                nome_loja: data.nome_loja,
                documento: data.documento,      
                contato_whats: data.contato_whats,
                email: data.email,              
                responsavel: data.responsavel,  
                endereco: data.endereco,        
                reputacao: data.reputacao ? parseFloat(data.reputacao) : 0,
                prazo_medio: data.prazo_medio ? parseInt(data.prazo_medio) : null,
                status: data.status || 'Ativo',  
                id_tenant: id_tenant
            }
        });
    },

    findAll: async (id_tenant) => {
        return prisma.fornecedores.findMany({
            where: { id_tenant: id_tenant },
            orderBy: { nome_loja: 'asc' },
            include: {
                _count: {
                    select: { produtos: true } 
                }
            }
        });
    },

    findById: async (id, id_tenant) => {
        return prisma.fornecedores.findFirst({
            where: { 
                id_fornecedor: id,
                id_tenant: id_tenant
            }
        });
    },

    update: async (id, data, id_tenant) => {
        return prisma.fornecedores.updateMany({
            where: { 
                id_fornecedor: id,
                id_tenant: id_tenant
            },
            data: {
                nome_loja: data.nome_loja,
                documento: data.documento,      
                contato_whats: data.contato_whats,
                email: data.email,              
                responsavel: data.responsavel,  
                endereco: data.endereco,        
                status: data.status,            
                reputacao: data.reputacao !== undefined ? parseFloat(data.reputacao) : undefined,
                prazo_medio: data.prazo_medio !== undefined ? parseInt(data.prazo_medio) : undefined
            }
        });
    },

    remove: async (id, id_tenant) => {
        return prisma.fornecedores.deleteMany({
            where: { 
                id_fornecedor: id,
                id_tenant: id_tenant
            }
        });
    }
};

export default Fornecedor;