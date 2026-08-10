import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const Usuario = {
    // 🛡️ Múltiplos Usuários: Filtra pela loja
    findAll: async (id_tenant) => {
        return prisma.usuarios.findMany({
            where: { id_tenant: id_tenant },
            select: { 
                id_usuario: true,
                nome_completo: true,
                email: true,
                role: true,
                isAdmin: true,
                codigo_acesso: true 
            }
        });
    },

    // 🛡️ Busca por ID: Garante que o usuário pertence à loja
    findById: async (id, id_tenant) => {
        return prisma.usuarios.findFirst({
            where: { 
                id_usuario: id,
                id_tenant: id_tenant 
            },
        });
    },

    // 🛡️ Busca por Email: Um mesmo email pode existir em lojas diferentes
    findByEmail: async (email, id_tenant) => {
        return prisma.usuarios.findFirst({
            where: { 
                email: email,
                id_tenant: id_tenant 
            },
        });
    },

    // 🛡️ CPF Criptografado
    findByCpfEncrypted: async (cpfCriptografado, id_tenant) => {
        if (!cpfCriptografado) return null;
        return prisma.usuarios.findFirst({
            where: { 
                cpf_criptografado: cpfCriptografado,
                id_tenant: id_tenant 
            },
        });
    },

    // 🛡️ Código de Acesso
    findByCodigoAcesso: async (codigo, id_tenant) => {
        if (!codigo) return null;
        return prisma.usuarios.findFirst({
            where: { 
                codigo_acesso: codigo,
                id_tenant: id_tenant
            }
        });
    },
    
    // 🛡️ Perfil
    findProfileById: async (id, id_tenant) => {
        return prisma.usuarios.findFirst({
            where: { 
                id_usuario: id,
                id_tenant: id_tenant
            },
        });
    },

    // 🛡️ Criação: Obriga a injeção do id_tenant
    create: async (usuarioData) => {
        return prisma.usuarios.create({
            data: {
                id_tenant: usuarioData.id_tenant, // <--- OBRIGATÓRIO NO SAAS
                nome_completo: usuarioData.nome || usuarioData.nome_completo,
                email: usuarioData.email,
                hash_senha: usuarioData.senhaHasheada || usuarioData.hash_senha, 
                role: usuarioData.role || 'CLIENTE',
                codigo_acesso: usuarioData.codigo_acesso || null,
                cpf_criptografado: usuarioData.cpfCriptografado || null,
                telefone_criptografado: usuarioData.telefoneCriptografado || null,
                data_nascimento_criptografada: usuarioData.dataNascimentoCriptografada || null,
                data_criacao: new Date(),
                score_reputacao: usuarioData.score_reputacao || 50,
                is_verified: usuarioData.is_verified || false
            },
        });
    },

    // 🛡️ Update Admin (Por segurança, filtramos o id_tenant no where)
    updateByAdmin: async (id, data, id_tenant) => {
        return prisma.usuarios.updateMany({
            where: { 
                id_usuario: id,
                id_tenant: id_tenant // Impede alterar usuário de outra loja
            },
            data: {
                nome_completo: data.nome || data.nome_completo,
                email: data.email,
                role: data.role,
                isAdmin: data.isAdmin,
                codigo_acesso: data.codigo_acesso,
                ...(data.hash_senha && { hash_senha: data.hash_senha }),
                ...(data.senhaHasheada && { hash_senha: data.senhaHasheada }) 
            },
        });
    },

    // 🛡️ Delete: Só deleta se pertencer à loja
    delete: async (id, id_tenant) => {
        return prisma.usuarios.deleteMany({
            where: { 
                id_usuario: id,
                id_tenant: id_tenant 
            },
        });
    },

    // 🛡️ Update Profile
    updateProfile: async (id, data, id_tenant) => {
        return prisma.usuarios.updateMany({
            where: { 
                id_usuario: id,
                id_tenant: id_tenant 
            },
            data: {
                nome_completo: data.nome || data.nome_completo,
                email: data.email,
                telefone_criptografado: data.telefoneCriptografado,
                cpf_criptografado: data.cpfCriptografado,
                data_nascimento_criptografada: data.dataNascimentoCriptografada,
            },
        });
    },

    // 🛡️ Update Genérico
    update: async (id, data, id_tenant) => {
        return prisma.usuarios.updateMany({
            where: { 
                id_usuario: id,
                id_tenant: id_tenant 
            },
            data: data
        });
    },

    // 🛡️ Reset de Senha: Confirma o token E a loja
    findByValidResetToken: async (token, id_tenant) => {
        return prisma.usuarios.findFirst({
            where: {
                reset_password_token: token,
                id_tenant: id_tenant,
                reset_password_expires: {
                    gt: new Date(),
                },
            },
        });
    },

    savePasswordResetToken: async (id_usuario, token, expires, id_tenant) => {
        return prisma.usuarios.updateMany({
            where: { 
                id_usuario: id_usuario,
                id_tenant: id_tenant 
            },
            data: {
                reset_password_token: token,
                reset_password_expires: expires,
            },
        });
    },

    // 🛡️ Busca especial (Garante que busca CPF só da loja)
    findAllForSearch: async (id_tenant) => {
        return prisma.usuarios.findMany({
            where: {
                id_tenant: id_tenant,
                NOT: { cpf_criptografado: null } 
            },
            select: {
                id_usuario: true,
                nome_completo: true,
                email: true,
                role: true,
                cpf_criptografado: true 
            }
        });
    },

    updatePasswordById: async (id_usuario, novaSenhaHasheada, id_tenant) => {
        return prisma.usuarios.updateMany({
            where: { 
                id_usuario: id_usuario,
                id_tenant: id_tenant 
            },
            data: {
                hash_senha: novaSenhaHasheada,
                reset_password_token: null,
                reset_password_expires: null,
            },
        });
    },

    // 🛡️ Contagem da loja
    count: async (id_tenant) => {
        return prisma.usuarios.count({
            where: { id_tenant: id_tenant }
        });
    },

    // 🛡️ Busca Global por termo (dentro da loja)
    search: async (term, id_tenant) => {
        return prisma.usuarios.findMany({
            where: {
                id_tenant: id_tenant,
                OR: [
                    { nome_completo: { contains: term } }, 
                    { email: { contains: term } },
                    { codigo_acesso: { contains: term } },
                ],
            },
            select: { 
                id_usuario: true,
                nome_completo: true,
                email: true,
                role: true,
                isAdmin: true,
                codigo_acesso: true
            }
        });
    },
};

export default Usuario;