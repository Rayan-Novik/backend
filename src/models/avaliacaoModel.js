import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const AvaliacaoModel = {
    // Busca todas as avaliações de um produto específico (Público)
    findByProductId: async (id_produto) => {
        return prisma.avaliacoes.findMany({
            where: { id_produto: id_produto },
            orderBy: { data_avaliacao: 'desc' },
            include: {
                usuarios: { // Inclui o nome do utilizador
                    select: { nome_completo: true }
                }
                // Nota: imagem_url e resposta_admin vêm automaticamente pois são campos da tabela
            }
        });
    },

    // --- NOVO: Busca TODAS as avaliações (Para o Painel Admin) ---
    findAll: async () => {
        return prisma.avaliacoes.findMany({
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

    // --- NOVO: Admin responde uma avaliação ---
    reply: async (id_avaliacao, textoResposta) => {
        return prisma.avaliacoes.update({
            where: { id_avaliacao: Number(id_avaliacao) },
            data: {
                resposta_admin: textoResposta,
                data_resposta: new Date() // Grava o momento da resposta
            }
        });
    },

    // Cria uma nova avaliação (Atualizado com imagem_url)
    create: async (data) => {
        return prisma.avaliacoes.create({
            data: {
                id_produto: data.id_produto,
                id_usuario: data.id_usuario,
                nota: data.nota,
                comentario: data.comentario,
                imagem_url: data.imagem_url // <--- Novo campo
            }
        });
    },
    
    // Verifica se um utilizador já avaliou um produto
    checkIfUserReviewed: async (id_usuario, id_produto) => {
        return prisma.avaliacoes.findFirst({
            where: {
                id_usuario: id_usuario,
                id_produto: id_produto,
            }
        });
    }
};

export default AvaliacaoModel;