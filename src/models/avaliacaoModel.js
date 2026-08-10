import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const AvaliacaoModel = {
    findByProductId: async (id_produto, id_tenant) => {
        return prisma.avaliacoes.findMany({
            where: { 
                id_produto: id_produto,
                id_tenant: id_tenant // 🛡️ BLINDAGEM SAAS
            },
            orderBy: { data_avaliacao: 'desc' },
            include: {
                usuarios: { 
                    select: { nome_completo: true }
                }
            }
        });
    },

    findAll: async (id_tenant) => {
        return prisma.avaliacoes.findMany({
            where: { id_tenant: id_tenant }, // 🛡️ BLINDAGEM SAAS
            orderBy: { data_avaliacao: 'desc' },
            include: {
                usuarios: { 
                    select: { id_usuario: true, nome_completo: true, email: true } 
                },
                produtos: { 
                    select: { id_produto: true, nome: true, imagem_url: true } 
                }
            }
        });
    },

    reply: async (id_avaliacao, textoResposta, id_tenant) => {
        return prisma.avaliacoes.updateMany({
            where: { 
                id_avaliacao: Number(id_avaliacao),
                id_tenant: id_tenant // 🛡️ BLINDAGEM SAAS
            },
            data: {
                resposta_admin: textoResposta,
                data_resposta: new Date() 
            }
        });
    },

    create: async (data) => {
        return prisma.avaliacoes.create({
            data: {
                id_tenant: data.id_tenant, // 🛡️ BLINDAGEM SAAS
                id_produto: data.id_produto,
                id_usuario: data.id_usuario,
                nota: data.nota,
                comentario: data.comentario,
                imagem_url: data.imagem_url 
            }
        });
    },
    
    checkIfUserReviewed: async (id_usuario, id_produto, id_tenant) => {
        return prisma.avaliacoes.findFirst({
            where: {
                id_usuario: id_usuario,
                id_produto: id_produto,
                id_tenant: id_tenant // 🛡️ BLINDAGEM SAAS
            }
        });
    }
};

export default AvaliacaoModel;