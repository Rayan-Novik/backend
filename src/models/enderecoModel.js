import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export default {
    async findByUserId(id_usuario) {
        return prisma.enderecos.findMany({
            where: {
                id_usuario: Number(id_usuario),
                is_active: true
            },
            orderBy: {
                is_principal: 'desc' // 🟢 Traz o endereço principal sempre no topo da lista
            }
        });
    },

    async findById(id_endereco, id_usuario) {
        return prisma.enderecos.findFirst({
            where: {
                id_endereco: Number(id_endereco),
                id_usuario: Number(id_usuario),
                is_active: true 
            },
        });
    },

    // 🟢 NOVA FUNÇÃO: Desmarca todos os endereços do usuário como principal
    async resetPrincipal(id_usuario) {
        return prisma.enderecos.updateMany({
            where: {
                id_usuario: Number(id_usuario),
            },
            data: {
                is_principal: false
            }
        });
    },

    async create(id_usuario, dadosEndereco) {
        return prisma.enderecos.create({
            data: {
                ...dadosEndereco,
                id_usuario: Number(id_usuario),
                is_active: true 
            }
        });
    },

    async update(id_endereco, id_usuario, dadosEndereco) {
        return prisma.enderecos.updateMany({
            where: {
                id_endereco: Number(id_endereco),
                id_usuario: Number(id_usuario),
            },
            data: dadosEndereco,
        });
    },

    async remove(id_endereco, id_usuario) {
        return prisma.enderecos.updateMany({
            where: {
                id_endereco: Number(id_endereco),
                id_usuario: Number(id_usuario)
            },
            data: {
                is_active: false
            }
        });
    },
};