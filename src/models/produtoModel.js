import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const Produto = {
    /**
     * Busca todos os produtos, incluindo a primeira imagem de cada um para a listagem.
     */
    findAll: async (options = {}) => {
        const whereClause = {};
        
        // Se for solicitado apenas ativos (uso público)
        if (options.onlyActive) {
            whereClause.active_ecommerce = true;
        }

        return prisma.produtos.findMany({
            where: whereClause,
            include: {
                produto_subimagens: {
                    take: 1,
                    orderBy: { ordem: 'asc' }
                }
            }
        });
    },

    /**
     * Busca um único produto pelo seu ID, incluindo TODAS as suas sub-imagens.
     */
    findById: async (id) => {
        return prisma.produtos.findUnique({
            where: { id_produto: id },
            include: {
                produto_subimagens: {
                    orderBy: {
                        ordem: 'asc',
                    },
                },
            },
        });
    },

    /**
     * Incrementa o contador de visualizações de um produto.
     */
    incrementView: async (id) => {
        return prisma.produtos.update({
            where: { id_produto: id },
            data: {
                visualizacoes: {
                    increment: 1,
                },
            },
        });
    },

    /**
     * Busca vários produtos a partir de uma lista de IDs.
     */
    findByIds: async (ids) => {
        if (!ids || ids.length === 0) {
            return [];
        }
        return prisma.produtos.findMany({
            where: {
                id_produto: {
                    in: ids,
                },
            },
        });
    },

    /**
     * Busca produtos por nome de categoria.
     */
    findByCategoryName: async (categoryName, limit = null) => {
        const queryOptions = {
            where: {
                categorias: { nome: categoryName },
                active_ecommerce: true // 👈 Filtro adicionado
            },
            include: {
                categorias: true // Para ter o nome da categoria no card
            }
        };

        if (limit) {
            queryOptions.take = limit;
        }

        return prisma.produtos.findMany(queryOptions);
    },

    /**
     * Busca produtos por subcategorias.
     */

    findBySubcategory: async (subcategoryId) => {
        return prisma.produtos.findMany({
            where: { 
                id_subcategoria: Number(subcategoryId),
                ativo: true,            // Produto não deletado
                active_ecommerce: true  // 👈 GARANTIA DE QUE ESTÁ ATIVO NO SITE
            },
            include: {
                produto_subimagens: {
                    take: 1,
                    orderBy: { ordem: 'asc' }
                }
            }
        });
    },

    findBySubcategoryName: async (subName) => {
        return prisma.produtos.findMany({
            where: {
                subcategorias: { 
                    nome: subName // Filtra pelo nome da subcategoria
                },
                ativo: true,            // Produto não deletado
                active_ecommerce: true  // 👈 GARANTIA DE QUE ESTÁ ATIVO NO SITE
            },
            include: {
                produto_subimagens: { 
                    take: 1, 
                    orderBy: { ordem: 'asc' } 
                }
            }
        });
    },

    /**
     * Busca produtos por nome de marca.
     */
    findByBrandName: async (brandName) => {
        return prisma.produtos.findMany({
            where: {
                marcas: {
                    nome: brandName,
                },
            },
        });
    },

    /**
     * Procura produtos por uma palavra-chave.
     */
    search: async (keyword) => {
        return prisma.produtos.findMany({
            where: {
                AND: [
                    { active_ecommerce: true }, // 👈 Filtro adicionado
                    {
                        OR: [
                            { nome: { contains: keyword, }, },
                            { categorias: { nome: { contains: keyword, }, }, },
                        ],
                    }
                ]
            },
        });
    },

    /**
     * Filtra produtos com base num tipo e valor.
     */
    filterBy: async (type, value) => {
        const whereClause = {};

        switch (type) {
            case 'categoria':
                whereClause.categorias = { nome: value };
                break;
            case 'marca':
                whereClause.marcas = { nome: value };
                break;
            case 'desconto':
                whereClause.desconto_percentual = { gte: parseInt(value, 10) };
                break;
            default:
                return [];
        }

        return prisma.produtos.findMany({ where: whereClause });
    },

    toggleEcommerce: async (id, status) => {
        return prisma.produtos.update({
            where: { id_produto: id },
            data: { active_ecommerce: status }
        });
    },

    /**
     * Cria um novo produto.
     */
    create: async (produtoData) => {
        return prisma.produtos.create({
            data: produtoData,
        });
    },

    /**
     * Atualiza um produto existente.
     */
    update: async (id, produtoData) => {
        return prisma.produtos.update({
            where: { id_produto: id },
            data: produtoData,
        });
    },

    /**
     * Apaga um produto.
     */
    remove: async (id) => {
        return prisma.produtos.delete({
            where: { id_produto: id },
        });
    },

    /**
     * Conta o número total de produtos.
     */
    count: async () => {
        return prisma.produtos.count();
    },
};

export default Produto;

