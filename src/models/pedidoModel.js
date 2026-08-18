import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt } from '../services/cryptoService.js';

const prisma = new PrismaClient();
const toFloat = (val) => parseFloat(val) || 0;

export default {
    async create(pedidoData, itemsData, id_tenant) {
        const itensParaSalvar = itemsData.map(item => {
            // 1. Tenta pegar a variação de várias formas (blindagem)
            const variacao = item.variacao || item.produtos.variacao || null;

            // 2. Formata o nome
            let nomeFormatado = item.produtos.nome || item.nome;

            if (variacao) {
                // Verifica se a variação tem cor e tamanho
                const cor = variacao.cor ? `Cor: ${variacao.cor}` : '';
                const tam = variacao.tamanho ? `Tam: ${variacao.tamanho}` : '';
                const traco = (cor && tam) ? ' | ' : '';

                if (cor || tam) {
                    nomeFormatado += ` (${cor}${traco}${tam})`;
                }
            }

            return {
                id_produto: Number(item.produtos.id_produto || item.id_produto),
                nome: nomeFormatado, // 🟢 O campo obrigatório do seu banco
                quantidade: Number(item.quantidade),
                preco: toFloat(item.produtos.preco || item.preco),
                imagem_url: item.produtos.imagem_url || item.imagem_url || null,
                id_variacao: item.id_variacao ? Number(item.id_variacao) : null
            };
        });

        try {
            let tipoEntregaLabel = pedidoData.tipo_entrega || 'ENTREGA';
            let metodoEnvio = 'Delivery';
            let complementoFinal = pedidoData.entrega_complemento || null;

            if (tipoEntregaLabel === 'RETIRADA') {
                metodoEnvio = 'Retirada na Loja';
            } else if (tipoEntregaLabel === 'LOCAL') {
                metodoEnvio = 'Consumo no Local';
                complementoFinal = pedidoData.info_local ? `Mesa/Nome: ${pedidoData.info_local}` : null;
            }

            const dataToCreate = {
                usuarios: {
                    connect: { id_usuario: Number(pedidoData.id_usuario) }
                },
                tenants: {
                    connect: { id: Number(id_tenant) }
                },
                metodo_pagamento: pedidoData.metodo_pagamento || 'OFFLINE',

                preco_itens: toFloat(pedidoData.preco_itens),
                preco_frete: toFloat(pedidoData.preco_frete),
                preco_total: toFloat(pedidoData.preco_total),

                status_pagamento: pedidoData.status_pagamento || 'PENDENTE',
                id_pagamento_gateway: pedidoData.id_pagamento_gateway || null,
                gateway_provider: pedidoData.gateway_provider || 'OFFLINE',

                metodo_envio: metodoEnvio,

                entrega_logradouro: pedidoData.entrega_logradouro || null,
                entrega_numero: pedidoData.entrega_numero || null,
                entrega_bairro: pedidoData.entrega_bairro || null,
                entrega_cidade: pedidoData.entrega_cidade || null,
                entrega_estado: pedidoData.entrega_estado || null,
                entrega_cep: pedidoData.entrega_cep || null,
                entrega_complemento: complementoFinal,

                url_boleto: pedidoData.url_boleto || null,
                linha_digitavel: pedidoData.linha_digitavel || null,

                pedido_items: {
                    create: itensParaSalvar
                }
            };

            if (pedidoData.id_endereco_entrega && tipoEntregaLabel === 'ENTREGA') {
                dataToCreate.enderecos = {
                    connect: { id_endereco: Number(pedidoData.id_endereco_entrega) }
                };
            }

            if (pedidoData.id_cupom_utilizado) {
                dataToCreate.cupons_desconto = {
                    connect: { id_cupom: Number(pedidoData.id_cupom_utilizado) }
                };
            }

            const novoPedido = await prisma.pedidos.create({
                data: dataToCreate,
                include: {
                    pedido_items: true
                }
            });

            return novoPedido;
        } catch (error) {
            console.error("Erro Prisma create pedido:", error);
            throw error;
        }
    },

    async updateStatusByGatewayId(gatewayId, status, id_tenant) {
        try {
            return await prisma.$transaction(async (tx) => {
                const pedidoAnterior = await tx.pedidos.findFirst({
                    where: {
                        id_pagamento_gateway: String(gatewayId),
                        id_tenant: id_tenant
                    },
                    select: { id_pedido: true, status_pagamento: true, id_usuario: true }
                });

                if (!pedidoAnterior) return null;

                if (status === 'PAGO' && pedidoAnterior.status_pagamento !== 'PAGO') {
                    const items = await tx.pedido_items.findMany({
                        where: { id_pedido: pedidoAnterior.id_pedido }
                    });

                    for (const item of items) {
                        if (item.id_produto) {
                            let estoqueMomento = 0;

                            // 🟢 BAIXA NA VARIAÇÃO
                            if (item.id_variacao) {
                                const variacaoDb = await tx.produto_variacoes.findUnique({ where: { id_variacao: item.id_variacao } });
                                if (variacaoDb) {
                                    estoqueMomento = Number(variacaoDb.estoque) - Number(item.quantidade);
                                    await tx.produto_variacoes.update({
                                        where: { id_variacao: item.id_variacao },
                                        data: { estoque: estoqueMomento >= 0 ? estoqueMomento : 0 }
                                    });
                                }
                            }
                            // 🟢 BAIXA NORMAL
                            else {
                                const produtoAtualizado = await tx.produtos.update({
                                    where: {
                                        id_produto: item.id_produto,
                                    },
                                    data: { estoque: { decrement: item.quantidade } }
                                });
                                estoqueMomento = produtoAtualizado.estoque;
                            }

                            // Registra o Rastreio (Auditoria)
                            await tx.MovimentacaoEstoque.create({
                                data: {
                                    id_produto: item.id_produto,
                                    quantidade: item.quantidade,
                                    tipo: 'SAIDA',
                                    saldo_momento: estoqueMomento >= 0 ? estoqueMomento : 0,
                                    motivo: `Venda Online - Pedido #${pedidoAnterior.id_pedido}`,
                                    origem_destino: 'Site / E-commerce',
                                    usuario_id: pedidoAnterior.id_usuario
                                }
                            });
                        }
                    }
                }

                const dadosAtualizacao = { status_pagamento: status };

                if (status === 'PAGO') {
                    dadosAtualizacao.status_entrega = 'Em processamento';
                }

                const pedidoAtualizado = await tx.pedidos.updateMany({
                    where: {
                        id_pedido: pedidoAnterior.id_pedido,
                        id_tenant: id_tenant
                    },
                    data: dadosAtualizacao
                });

                return {
                    id_pedido: pedidoAnterior.id_pedido,
                    id_usuario: pedidoAnterior.id_usuario,
                    status_pagamento: status
                };
            });
        } catch (error) {
            console.error("Erro Prisma updateStatus:", error);
            throw error;
        }
    },

    async cancelarPedidosExpirados() {
        const tempoLimite = new Date(Date.now() - 60 * 60 * 1000);

        try {
            const pedidosPendentes = await prisma.pedidos.findMany({
                where: {
                    status_pagamento: 'PENDENTE',
                    data_pedido: { lt: tempoLimite }
                },
                select: { id_pedido: true, id_tenant: true }
            });

            if (pedidosPendentes.length === 0) return 0;

            let totalProcessados = 0;

            for (const p of pedidosPendentes) {
                await prisma.$transaction(async (tx) => {
                    const pedidoCheck = await tx.pedidos.findFirst({
                        where: {
                            id_pedido: p.id_pedido,
                            id_tenant: p.id_tenant
                        }
                    });

                    if (!pedidoCheck || pedidoCheck.status_pagamento !== 'PENDENTE') return;

                    await tx.pedidos.updateMany({
                        where: {
                            id_pedido: p.id_pedido,
                            id_tenant: p.id_tenant
                        },
                        data: {
                            status_pagamento: 'CANCELADO',
                            status_entrega: 'Cancelado por expiração'
                        }
                    });

                    totalProcessados++;
                });
            }

            return totalProcessados;

        } catch (error) {
            console.error("Erro Prisma cancelarPedidosExpirados:", error);
            throw error;
        }
    },

    async countUserOrdersLast24h(idUsuario, id_tenant) {
        const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return await prisma.pedidos.count({
            where: {
                id_usuario: idUsuario,
                id_tenant: id_tenant,
                data_pedido: { gte: ontem }
            }
        });
    },

    async findById(id_param, id_usuario, id_tenant) {
        const whereClause = {
            id_tenant: id_tenant,
            OR: [
                { id_pagamento_gateway: String(id_param) }
            ]
        };

        if (!isNaN(id_param)) {
            whereClause.OR.push({ id_pedido: Number(id_param) });
        }

        if (id_usuario) {
            whereClause.id_usuario = id_usuario;
        }

        const pedidoCompleto = await prisma.pedidos.findFirst({
            where: whereClause,
            include: {
                enderecos: true,
                usuarios: true,
                pedido_items: true // Apenas busque os itens, o nome já virá concatenado conforme o passo anterior
            }
        });

        if (!pedidoCompleto) return null;

        return {
            ...pedidoCompleto,
            pedido: pedidoCompleto,
            cliente: pedidoCompleto.usuarios,
            endereco: pedidoCompleto.enderecos || {
                logradouro: pedidoCompleto.entrega_logradouro,
                numero: pedidoCompleto.entrega_numero,
                bairro: pedidoCompleto.entrega_bairro,
                cidade: pedidoCompleto.entrega_cidade,
                estado: pedidoCompleto.entrega_estado,
                cep: pedidoCompleto.entrega_cep,
                complemento: pedidoCompleto.entrega_complemento
            },
            items: pedidoCompleto.pedido_items
        };
    },

    async findAllByUserId(id_usuario, id_tenant) {
        return await prisma.pedidos.findMany({
            where: {
                id_usuario: Number(id_usuario),
                id_tenant: id_tenant
            },
            select: {
                id_pedido: true,
                data_pedido: true,
                preco_total: true,
                status_pagamento: true
            },
            orderBy: { data_pedido: 'desc' }
        });
    },

    async findAll(filtro = {}, id_tenant) {
        const whereClause = { id_tenant: id_tenant };

        if (filtro.canal_venda) {
            if (filtro.canal_venda.not) {
                whereClause.canal_venda = { not: filtro.canal_venda.not };
            } else {
                whereClause.canal_venda = filtro.canal_venda;
            }
        }

        return await prisma.pedidos.findMany({
            where: whereClause,
            include: {
                usuarios: { select: { nome_completo: true } }
            },
            orderBy: { data_pedido: 'desc' }
        });
    },

    async update(id_pedido, data, id_tenant) {
        return await prisma.pedidos.updateMany({
            where: {
                id_pedido: Number(id_pedido),
                id_tenant: id_tenant
            },
            data: data
        });
    },

    async remove(id_pedido, id_tenant) {
        return await prisma.pedidos.deleteMany({
            where: {
                id_pedido: Number(id_pedido),
                id_tenant: id_tenant
            }
        });
    },

    async count(id_tenant) {
        return await prisma.pedidos.count({
            where: { id_tenant: id_tenant }
        });
    },

    async aggregate(id_tenant) {
        const result = await prisma.$queryRaw`
            SELECT 
                SUM(CASE WHEN status_pagamento = 'PAGO' THEN preco_total ELSE 0 END) as totalVendas,
                SUM(CASE WHEN status_pagamento = 'PENDENTE' THEN preco_total ELSE 0 END) as totalPendente
            FROM pedidos
            WHERE id_tenant = ${id_tenant}
        `;

        return {
            totalVendas: toFloat(result[0].totalVendas),
            totalPendente: toFloat(result[0].totalPendente)
        };
    },

    async getSalesOverTime(id_tenant) {
        const result = await prisma.$queryRaw`
            SELECT
                DATE_FORMAT(data_pedido, '%Y-%m') as mes,
                SUM(CASE WHEN status_pagamento = 'PAGO' THEN preco_total ELSE 0 END) as vendasConfirmadas,
                SUM(CASE WHEN status_pagamento = 'PENDENTE' THEN preco_total ELSE 0 END) as vendasPendentes
            FROM pedidos
            WHERE data_pedido >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
              AND id_tenant = ${id_tenant}
            GROUP BY mes
            ORDER BY mes ASC
        `;
        return result;
    },

    async findMany(options, id_tenant) {
        return await prisma.pedidos.findMany({
            where: { id_tenant: id_tenant },
            take: options.take,
            include: {
                usuarios: { select: { nome_completo: true } }
            },
            orderBy: { data_pedido: 'desc' }
        });
    },

    async findByAddressId(id_endereco, id_tenant) {
        return await prisma.pedidos.findMany({
            where: {
                id_endereco_entrega: Number(id_endereco),
                id_tenant: id_tenant
            },
            select: { id_pedido: true }
        });
    },
};