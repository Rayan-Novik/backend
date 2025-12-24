import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const RelatorioModel = {
    // Busca os produtos mais vendidos (apenas de pedidos pagos)
    getBestSellers: async (limit = 5) => {
        return prisma.pedido_items.groupBy({
            by: ['id_produto'],
            where: {
                pedidos: {
                    status_pagamento: 'PAGO',
                },
            },
            _sum: {
                quantidade: true,
            },
            orderBy: {
                _sum: {
                    quantidade: 'desc',
                },
            },
            take: limit,
        });
    },
    
    // ✅ FUNÇÃO ATUALIZADA: Agora inclui produtos com zero vendas.
    getWorstSellers: async (limit = 5) => {
        // 1. Pega todos os produtos
        const allProducts = await prisma.produtos.findMany({
            select: {
                id_produto: true,
                nome: true,
            }
        });

        // 2. Pega a contagem de vendas de itens em pedidos PAGOS
        const soldItems = await prisma.pedido_items.groupBy({
            by: ['id_produto'],
            where: {
                pedidos: {
                    status_pagamento: 'PAGO',
                },
            },
            _sum: {
                quantidade: true,
            },
        });

        // 3. Cria um mapa para fácil acesso: { id_produto: total_vendido }
        const salesMap = soldItems.reduce((map, item) => {
            map[item.id_produto] = item._sum.quantidade;
            return map;
        }, {});

        // 4. Combina os dados: para cada produto, atribui a sua contagem de vendas (ou 0)
        const productsWithSales = allProducts.map(product => ({
            id_produto: product.id_produto,
            nome_produto: product.nome, // Garante que o nome do produto está disponível
            _sum: {
                quantidade: salesMap[product.id_produto] || 0,
            }
        }));

        // 5. Ordena por menos vendidos e retorna o limite
        productsWithSales.sort((a, b) => a._sum.quantidade - b._sum.quantidade);

        return productsWithSales.slice(0, limit);
    },

    // Busca os produtos mais visualizados
    getMostViewed: async (limit = 5) => {
        return prisma.produtos.findMany({
            orderBy: {
                visualizacoes: 'desc',
            },
            take: limit,
        });
    },

    // Busca todas as avaliações de clientes
    getCustomerFeedback: async () => {
        return prisma.avaliacoes.findMany({
            orderBy: {
                data_avaliacao: 'desc',
            },
            include: {
                usuarios: { select: { nome_completo: true } },
                produtos: { select: { nome: true } },
            }
        });
    },
};

export default RelatorioModel;
