import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const Produto = {
    /**
     * Busca todos os produtos da loja atual.
     */
    findAll: async (id_tenant, options = {}) => {
        const whereClause = { id_tenant: id_tenant }; // 🛡️ BLINDAGEM SAAS

        if (options.onlyActive) {
            whereClause.active_ecommerce = true;
            whereClause.tipo_produto = { in: ['FINAL', 'MISTO'] };
        }

        return prisma.produtos.findMany({
            where: whereClause,
            include: {
                categorias: { select: { id_categoria: true, nome: true } },
                marcas: { select: { id_marca: true, nome: true } },
                subcategorias: { select: { id_subcategoria: true, nome: true } },
                produto_subimagens: {
                    take: 1,
                    orderBy: { ordem: 'asc' }
                },
                produto_variacoes: true 
            },
            orderBy: { id_produto: 'desc' } 
        });
    },

    /**
     * Busca um produto por ID garantindo que pertence à loja
     */
    findById: async (id, id_tenant) => {
        return prisma.produtos.findFirst({
            where: {
                id_produto: Number(id),
                id_tenant: id_tenant
            },
            include: {
                categorias: { select: { id_categoria: true, nome: true } },
                marcas: { select: { id_marca: true, nome: true } },
                subcategorias: { select: { id_subcategoria: true, nome: true } },
                produto_subimagens: {
                    orderBy: { ordem: 'asc' },
                },
                produto_variacoes: true, // Variações Simples (Tamanho, Cor)
                
                // 🟢 A MÁGICA DOS ADICIONAIS (ESTILO IFOOD)
                // Isso traz os grupos ("Escolha seu Pão", "Adicionais") e os itens dentro deles
                grupos_complemento: {
                    orderBy: { ordem: 'asc' },
                    include: {
                        complementos: {
                            include: {
                                produto_add: {
                                    // Puxa o nome e foto do adicional (ex: "Bacon", "Pão Caseiro")
                                    select: { id_produto: true, nome: true, imagem_url: true }
                                }
                            }
                        }
                    }
                },

                // 🟢 CONTROLE DE ESTOQUE (Ficha Técnica Interna)
                composicao_pai: {
                    include: {
                        insumo: {
                            select: { id_produto: true, nome: true, unidade: true, estoque: true, preco_custo: true }
                        }
                    }
                }
            },
        });
    },

    /**
     * Incrementa o contador de visualizações
     */
    incrementView: async (id, id_tenant) => {
        return prisma.produtos.updateMany({
            where: {
                id_produto: Number(id),
                id_tenant: id_tenant 
            },
            data: {
                visualizacoes: { increment: 1 },
            },
        });
    },

    /**
     * Busca por lista de IDs na loja
     */
    findByIds: async (ids, id_tenant) => {
        if (!ids || ids.length === 0) return [];
        return prisma.produtos.findMany({
            where: {
                id_produto: { in: ids },
                id_tenant: id_tenant 
            },
            include: {
                categorias: { select: { id_categoria: true, nome: true } },
                marcas: { select: { id_marca: true, nome: true } }
            }
        });
    },

    /**
     * Buscas Públicas (Categorias, Subcategorias, Marcas)
     */
    findByCategoryName: async (categoryName, id_tenant, limit = null) => {
        const queryOptions = {
            where: {
                id_tenant: id_tenant, 
                categorias: { nome: categoryName },
                active_ecommerce: true,
                tipo_produto: { in: ['FINAL', 'MISTO'] }
            },
            include: {
                categorias: true,
                marcas: true,
                produto_subimagens: { take: 1 },
                produto_variacoes: true 
            }
        };
        if (limit) queryOptions.take = limit;
        return prisma.produtos.findMany(queryOptions);
    },

    findBySubcategory: async (subcategoryId, id_tenant) => {
        return prisma.produtos.findMany({
            where: {
                id_tenant: id_tenant,
                id_subcategoria: Number(subcategoryId),
                ativo: true,
                active_ecommerce: true
            },
            include: {
                produto_subimagens: { take: 1, orderBy: { ordem: 'asc' } },
                categorias: true,
                marcas: true
            }
        });
    },

    findBySubcategoryName: async (subName, id_tenant) => {
        return prisma.produtos.findMany({
            where: {
                id_tenant: id_tenant,
                subcategorias: { nome: subName },
                ativo: true,
                active_ecommerce: true
            },
            include: {
                produto_subimagens: { take: 1, orderBy: { ordem: 'asc' } },
                categorias: true,
                marcas: true
            }
        });
    },

    findByBrandName: async (brandName, id_tenant) => {
        return prisma.produtos.findMany({
            where: {
                id_tenant: id_tenant,
                marcas: { nome: brandName },
                active_ecommerce: true
            },
            include: {
                categorias: true,
                marcas: true,
                produto_subimagens: { take: 1 }
            }
        });
    },

    search: async (keyword, id_tenant) => {
        return prisma.produtos.findMany({
            where: {
                id_tenant: id_tenant, 
                AND: [
                    { active_ecommerce: true },
                    {
                        OR: [
                            { nome: { contains: keyword } },
                            { categorias: { nome: { contains: keyword } } },
                        ],
                    }
                ]
            },
            include: {
                categorias: true,
                marcas: true,
                produto_subimagens: { take: 1 }
            }
        });
    },

    filterBy: async (type, value, id_tenant) => {
        const whereClause = { id_tenant: id_tenant, active_ecommerce: true };
        switch (type) {
            case 'categoria': whereClause.categorias = { nome: value }; break;
            case 'marca': whereClause.marcas = { nome: value }; break;
            case 'desconto': whereClause.desconto_percentual = { gte: parseInt(value, 10) }; break;
            default: return [];
        }
        return prisma.produtos.findMany({
            where: whereClause,
            include: {
                categorias: true,
                marcas: true,
                produto_subimagens: { take: 1 }
            }
        });
    },

    toggleEcommerce: async (id, status, id_tenant) => {
        return prisma.produtos.updateMany({
            where: {
                id_produto: Number(id),
                id_tenant: id_tenant
            },
            data: { active_ecommerce: status }
        });
    },

    // ============================================================
    //      ESTOQUE, MANUFATURA E RASTREIO (FICHA TÉCNICA)
    // ============================================================

    setComposicao: async (id_produto_final, itens, id_tenant) => {
        const produto = await prisma.produtos.findFirst({
            where: { id_produto: Number(id_produto_final), id_tenant: id_tenant }
        });
        if (!produto) throw new Error("Produto não encontrado ou não pertence a esta loja.");

        return prisma.$transaction(async (tx) => {
            await tx.produto_composicao.deleteMany({ where: { id_produto_final: Number(id_produto_final) } });

            return await tx.produto_composicao.createMany({
                data: itens.map(item => ({
                    id_produto_final: Number(id_produto_final),
                    id_insumo: Number(item.id_insumo),
                    quantidade_necessaria: Number(item.quantidade)
                }))
            });
        });
    },

    fabricar: async (id_produto_final, qtd_fabricar, usuario_id, id_tenant) => {
        return prisma.$transaction(async (tx) => {
            const produtoFinal = await tx.produtos.findFirst({
                where: { id_produto: Number(id_produto_final), id_tenant: id_tenant }
            });
            if (!produtoFinal) throw new Error("Produto não encontrado.");

            const receita = await tx.produto_composicao.findMany({
                where: { id_produto_final: Number(id_produto_final) },
                include: { insumo: true }
            });

            if (receita.length === 0) throw new Error("Receita não definida para este produto.");

            for (const item of receita) {
                if (item.insumo.id_tenant !== id_tenant) continue;

                const totalNecessario = Number(item.quantidade_necessaria) * Number(qtd_fabricar);
                const estoqueAtual = Number(item.insumo.estoque);

                if (estoqueAtual < totalNecessario) {
                    throw new Error(`Estoque insuficiente de ${item.insumo.nome}. Faltam ${(totalNecessario - estoqueAtual).toFixed(3)} ${item.insumo.unidade}`);
                }

                await tx.produtos.updateMany({
                    where: { id_produto: item.id_insumo, id_tenant: id_tenant },
                    data: { estoque: { decrement: totalNecessario } }
                });

                await tx.movimentacaoEstoque.create({
                    data: {
                        id_produto: item.id_insumo,
                        quantidade: totalNecessario,
                        tipo: 'SAIDA',
                        saldo_momento: estoqueAtual - totalNecessario,
                        motivo: `Consumo (Produção de ${qtd_fabricar}un do produto ID ${id_produto_final})`,
                        usuario_id: usuario_id ? Number(usuario_id) : null
                    }
                });
            }

            const novoEstoqueFinal = Number(produtoFinal.estoque) + Number(qtd_fabricar);

            await tx.movimentacaoEstoque.create({
                data: {
                    id_produto: Number(id_produto_final),
                    quantidade: Number(qtd_fabricar),
                    tipo: 'ENTRADA',
                    saldo_momento: novoEstoqueFinal,
                    motivo: 'Produção Finalizada (Crafting)',
                    usuario_id: usuario_id ? Number(usuario_id) : null
                }
            });

            return await tx.produtos.updateMany({
                where: { id_produto: Number(id_produto_final), id_tenant: id_tenant },
                data: { estoque: novoEstoqueFinal }
            });
        }, { timeout: 20000 });
    },

    registrarMovimentacao: async ({ id_produto, quantidade, tipo, motivo, origem_destino, usuario_id, id_tenant }) => {
        return prisma.$transaction(async (tx) => {
            const produto = await tx.produtos.findFirst({
                where: { id_produto: Number(id_produto), id_tenant: id_tenant }
            });

            if (!produto) throw new Error("Produto não encontrado nesta loja.");

            const estoqueAtual = Number(produto.estoque);
            const qtdMovimento = Number(quantidade);
            const novoEstoque = tipo === 'ENTRADA' ? estoqueAtual + qtdMovimento : estoqueAtual - qtdMovimento;

            await tx.movimentacaoEstoque.create({
                data: {
                    id_produto: Number(id_produto),
                    tipo,
                    quantidade: qtdMovimento,
                    saldo_momento: novoEstoque,
                    motivo,
                    origem_destino,
                    usuario_id: usuario_id ? Number(usuario_id) : null
                }
            });

            return await tx.produtos.updateMany({
                where: { id_produto: Number(id_produto), id_tenant: id_tenant },
                data: { estoque: novoEstoque }
            });
        });
    },

    create: async (produtoData) => {
        return prisma.$transaction(async (tx) => {
            const novoProduto = await tx.produtos.create({ data: produtoData });

            if (Number(novoProduto.estoque) > 0) {
                await tx.movimentacaoEstoque.create({
                    data: {
                        id_produto: novoProduto.id_produto,
                        tipo: 'ENTRADA',
                        quantidade: Number(novoProduto.estoque),
                        saldo_momento: Number(novoProduto.estoque),
                        motivo: 'Estoque Inicial (Cadastro)',
                        origem_destino: 'Sistema'
                    }
                });
            }
            return novoProduto;
        });
    },

    update: async (id, produtoData, id_tenant) => {
        return prisma.produtos.updateMany({
            where: {
                id_produto: Number(id),
                id_tenant: id_tenant
            },
            data: produtoData,
        });
    },

    getRastreio: async (id, id_tenant) => {
        const produto = await prisma.produtos.findFirst({
            where: { id_produto: Number(id), id_tenant: id_tenant }
        });

        if (!produto) return [];

        return prisma.movimentacaoEstoque.findMany({
            where: { id_produto: Number(id) },
            orderBy: { data: 'desc' },
            include: {
                usuarios: { select: { nome_completo: true } }
            }
        });
    },

    remove: async (id, id_tenant) => {
        return prisma.produtos.deleteMany({
            where: {
                id_produto: Number(id),
                id_tenant: id_tenant
            }
        });
    },

    count: async (id_tenant) => {
        return prisma.produtos.count({
            where: { id_tenant: id_tenant }
        });
    },
};

export default Produto;