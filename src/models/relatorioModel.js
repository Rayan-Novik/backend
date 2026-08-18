import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const RelatorioModel = {
    // Busca os produtos mais vendidos (apenas de pedidos pagos do tenant)
    getBestSellers: async (id_tenant, limit = 5) => {
        return prisma.pedido_items.groupBy({
            by: ['id_produto'],
            where: {
                pedidos: {
                    status_pagamento: 'PAGO',
                    id_tenant: id_tenant
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
    
    // Inclui produtos com zero vendas dentro do tenant específico
    getWorstSellers: async (id_tenant, limit = 5) => {
        // 1. Pega todos os produtos do tenant
        const allProducts = await prisma.produtos.findMany({
            where: { id_tenant: id_tenant },
            select: {
                id_produto: true,
                nome: true,
            }
        });

        // 2. Pega a contagem de vendas de itens em pedidos PAGOS do tenant
        const soldItems = await prisma.pedido_items.groupBy({
            by: ['id_produto'],
            where: {
                pedidos: {
                    status_pagamento: 'PAGO',
                    id_tenant: id_tenant
                },
            },
            _sum: {
                quantidade: true,
            },
        });

        // 3. Cria um mapa para fácil acesso
        const salesMap = soldItems.reduce((map, item) => {
            map[item.id_produto] = item._sum.quantidade;
            return map;
        }, {});

        // 4. Combina os dados respeitando o isolamento
        const productsWithSales = allProducts.map(product => ({
            id_produto: product.id_produto,
            nome_produto: product.nome,
            _sum: {
                quantidade: salesMap[product.id_produto] || 0,
            }
        }));

        // 5. Ordena por menos vendidos e retorna o limite
        productsWithSales.sort((a, b) => a._sum.quantidade - b._sum.quantidade);

        return productsWithSales.slice(0, limit);
    },

    // Busca os produtos mais visualizados do tenant
    getMostViewed: async (id_tenant, limit = 5) => {
        return prisma.produtos.findMany({
            where: { id_tenant: id_tenant },
            orderBy: {
                visualizacoes: 'desc',
            },
            take: limit,
        });
    },

    // Busca todas as avaliações de clientes do tenant
    getCustomerFeedback: async (id_tenant) => {
        return prisma.avaliacoes.findMany({
            where: { id_tenant: id_tenant },
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