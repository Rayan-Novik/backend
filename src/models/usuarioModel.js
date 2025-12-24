// 1. Importa e inicializa o Cliente Prisma
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const Usuario = {
    findAll: async () => {
        return prisma.usuarios.findMany({
            select: { 
                id_usuario: true,
                nome_completo: true,
                email: true,
                role: true,    // ✅ CORREÇÃO: Necessário para a tabela exibir o cargo
                isAdmin: true  // ✅ CORREÇÃO: Importante para lógica de permissão
            }
        });
    },

    findById: async (id) => {
        return prisma.usuarios.findUnique({
            where: { id_usuario: id },
        });
    },

    findByEmail: async (email) => {
        return prisma.usuarios.findUnique({
            where: { email: email },
        });
    },

    findByCpfEncrypted: async (cpfCriptografado) => {
        return prisma.usuarios.findFirst({
            where: { 
                cpf_criptografado: cpfCriptografado 
            },
        });
    },
    
    findProfileById: async (id) => {
        return prisma.usuarios.findUnique({
            where: { id_usuario: id },
        });
    },

    // ✅ CORREÇÃO DE SEGURANÇA NO CREATE
    create: async (usuarioData) => {
        return prisma.usuarios.create({
            data: {
                nome_completo: usuarioData.nome,
                email: usuarioData.email,
                hash_senha: usuarioData.senhaHasheada,
                // Se vier role (do painel admin), usa ele. Se não (site), usa 'CLIENTE'.
                role: usuarioData.role || 'CLIENTE', 
            },
        });
    },

    updateByAdmin: async (id, data) => {
    return prisma.usuarios.update({
        where: { id_usuario: id },
        data: {
            nome_completo: data.nome,
            email: data.email,
            role: data.role,
            isAdmin: data.isAdmin,
            // Adicione esta linha para permitir salvar a senha se ela for passada
            ...(data.hash_senha && { hash_senha: data.hash_senha }) 
        },
    });
},

    delete: async (id) => {
        return prisma.usuarios.delete({
            where: { id_usuario: id },
        });
    },

    updateProfile: async (id, data) => {
        return prisma.usuarios.update({
            where: { id_usuario: id },
            data: {
                nome_completo: data.nome,
                email: data.email,
                telefone_criptografado: data.telefoneCriptografado,
                cpf_criptografado: data.cpfCriptografado,
                data_nascimento_criptografada: data.dataNascimentoCriptografada,
            },
        });
    },

    findByValidResetToken: async (token) => {
        return prisma.usuarios.findFirst({
            where: {
                reset_password_token: token,
                reset_password_expires: {
                    gt: new Date(),
                },
            },
        });
    },

    savePasswordResetToken: async (id_usuario, token, expires) => {
        return prisma.usuarios.update({
            where: { id_usuario: id_usuario },
            data: {
                reset_password_token: token,
                reset_password_expires: expires,
            },
        });
    },

    updatePasswordById: async (id_usuario, novaSenhaHasheada) => {
        return prisma.usuarios.update({
            where: { id_usuario: id_usuario },
            data: {
                hash_senha: novaSenhaHasheada,
                reset_password_token: null,
                reset_password_expires: null,
            },
        });
    },

    saveAsaasCustomerId: async (id, asaasCustomerId) => {
        return prisma.usuarios.update({
            where: { id_usuario: id },
            data: { asaas_customer_id: asaasCustomerId },
        });
    },

    count: async () => {
        return prisma.usuarios.count();
    },

    search: async (term) => {
        return prisma.usuarios.findMany({
            where: {
                OR: [
                    { nome_completo: { contains: term } },
                    { email: { contains: term } },
                ],
            },
            select: { 
                id_usuario: true,
                nome_completo: true,
                email: true,
                role: true,    // ✅ CORREÇÃO: Necessário para a busca exibir o cargo
                isAdmin: true
            }
        });
    },
};

export default Usuario;