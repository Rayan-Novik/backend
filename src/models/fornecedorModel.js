import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const Fornecedor = {
    create: async (data) => {
        return prisma.fornecedores.create({
            data: {
                nome_loja: data.nome_loja,
                documento: data.documento,      // ✅ Adicionado
                contato_whats: data.contato_whats,
                email: data.email,              // ✅ Adicionado
                responsavel: data.responsavel,  // ✅ Adicionado
                endereco: data.endereco,        // ✅ Adicionado
                reputacao: data.reputacao ? parseFloat(data.reputacao) : 0,
                prazo_medio: data.prazo_medio ? parseInt(data.prazo_medio) : null,
                status: data.status || 'Ativo'  // ✅ Adicionado
            }
        });
    },

    findAll: async () => {
        return prisma.fornecedores.findMany({
            orderBy: { nome_loja: 'asc' },
            include: {
                _count: {
                    select: { produtos: true } 
                }
            }
        });
    },

    findById: async (id) => {
        return prisma.fornecedores.findUnique({
            where: { id_fornecedor: id }
        });
    },

    update: async (id, data) => {
        return prisma.fornecedores.update({
            where: { id_fornecedor: id },
            data: {
                nome_loja: data.nome_loja,
                documento: data.documento,      // ✅ Adicionado
                contato_whats: data.contato_whats,
                email: data.email,              // ✅ Adicionado
                responsavel: data.responsavel,  // ✅ Adicionado
                endereco: data.endereco,        // ✅ Adicionado
                status: data.status,            // ✅ Adicionado
                reputacao: data.reputacao !== undefined ? parseFloat(data.reputacao) : undefined,
                prazo_medio: data.prazo_medio !== undefined ? parseInt(data.prazo_medio) : undefined
            }
        });
    },

    remove: async (id) => {
        return prisma.fornecedores.delete({
            where: { id_fornecedor: id }
        });
    }
};

export default Fornecedor;