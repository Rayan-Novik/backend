import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const Categoria = {
    // ------------------- CATEGORIAS (PAI) -------------------

    findAll: async () => {
        return prisma.categorias.findMany({
            // Adicionei o 'include' para já trazer as subcategorias dessa categoria
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

    create: async (nome) => {
        return prisma.categorias.create({
            data: { nome }
        });
    },

    update: async (id, nome) => {
        return prisma.categorias.update({
            where: { id_categoria: Number(id) },
            data: { nome }
        });
    },

    remove: async (id) => {
        return prisma.categorias.delete({
            where: { id_categoria: id }
        });
    },

    // ------------------- SUBCATEGORIAS (FILHO) -------------------
    // ✅ NOVAS FUNÇÕES ABAIXO

    createSubcategoria: async (nome, id_categoria) => {
        return prisma.subcategorias.create({
            data: {
                nome,
                id_categoria: Number(id_categoria)
            }
        });
    },

    updateSubcategoria: async (id, dados) => {
        return prisma.subcategorias.update({
            where: { id_subcategoria: Number(id) },
            data: dados
        });
    },

    removeSubcategoria: async (id_subcategoria) => {
        return prisma.subcategorias.delete({
            where: { id_subcategoria: id_subcategoria }
        });
    }
};

export default Categoria;