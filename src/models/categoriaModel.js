import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const Categoria = {
    // ------------------- CATEGORIAS (PAI) -------------------

    findAll: async (id_tenant) => {
        return prisma.categorias.findMany({
            where: { id_tenant: id_tenant }, // 🛡️ BLINDAGEM SAAS
            include: {
                subcategorias: {
                    orderBy: { nome: 'asc' }
                }
            },
            orderBy: {
                nome: 'asc'
            }
        });
    },

    create: async (nome, id_tenant) => {
        return prisma.categorias.create({
            data: { 
                nome: nome,
                id_tenant: id_tenant // 🛡️ BLINDAGEM SAAS
            }
        });
    },

    update: async (id, nome, id_tenant) => {
        return prisma.categorias.updateMany({
            where: { 
                id_categoria: Number(id),
                id_tenant: id_tenant // Impede alterar categoria de outra loja
            },
            data: { nome }
        });
    },

    remove: async (id, id_tenant) => {
        return prisma.categorias.deleteMany({
            where: { 
                id_categoria: Number(id),
                id_tenant: id_tenant // Garante exclusão segura
            }
        });
    },

    // ------------------- SUBCATEGORIAS (FILHO) -------------------

    createSubcategoria: async (nome, id_categoria, id_tenant) => {
        // Validação extra: a categoria pai pertence a esta loja?
        const categoriaPai = await prisma.categorias.findFirst({
            where: { id_categoria: Number(id_categoria), id_tenant: id_tenant }
        });

        if (!categoriaPai) {
            throw new Error("Categoria não encontrada nesta loja.");
        }

        return prisma.subcategorias.create({
            data: {
                nome: nome,
                id_categoria: Number(id_categoria),
                id_tenant: id_tenant // 🛡️ BLINDAGEM SAAS
            }
        });
    },

    updateSubcategoria: async (id, dados, id_tenant) => {
        return prisma.subcategorias.updateMany({
            where: { 
                id_subcategoria: Number(id),
                id_tenant: id_tenant 
            },
            data: dados
        });
    },

    removeSubcategoria: async (id_subcategoria, id_tenant) => {
        return prisma.subcategorias.deleteMany({
            where: { 
                id_subcategoria: Number(id_subcategoria),
                id_tenant: id_tenant
            }
        });
    }
};

export default Categoria;