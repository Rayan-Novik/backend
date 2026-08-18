import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export default {
    // Busca caixa aberto de um usuário
    async findAbertoByUsuario(id_usuario) {
        return prisma.caixa_pdv.findFirst({
            where: {
                id_usuario: id_usuario,
                status: 'ABERTO'
            }
        });
    },

    async create(dados) {
        return prisma.caixa_pdv.create({
            data: {
                id_usuario: dados.id_usuario,
                saldo_inicial: dados.saldo_inicial,
                saldo_sistema: 0,
                status: 'ABERTO',
                observacoes: dados.observacoes
            }
        });
    },

    async close(id_caixa, dados) {
        return prisma.caixa_pdv.update({
            where: { id_caixa: id_caixa },
            data: {
                status: 'FECHADO',
                data_fechamento: new Date(),
                saldo_final: dados.saldo_final,
                saldo_sistema: dados.saldo_sistema, // Total calculado pelo sistema
                observacoes: dados.observacoes
            }
        });
    },

    async addMovimentacao(dados) {
        return prisma.movimentacao_caixa.create({
            data: {
                id_caixa: dados.id_caixa,
                tipo: dados.tipo, // 'ENTRADA' ou 'SAIDA'
                valor: dados.valor,
                motivo: dados.motivo
            }
        });
    },

    // Atualiza o saldo do sistema quando ocorre uma venda em dinheiro
    async updateSaldoSistema(id_caixa, valor) {
        return prisma.caixa_pdv.update({
            where: { id_caixa: id_caixa },
            data: {
                saldo_sistema: { increment: valor }
            }
        });
    },

    async getResumoCaixa(id_caixa) {
        // Busca movimentações e pedidos vinculados para relatório
        const caixa = await prisma.caixa_pdv.findUnique({
            where: { id_caixa },
            include: {
                movimentacao_caixa: true,
                pedidos: {
                    select: {
                        id_pedido: true,
                        preco_total: true,
                        metodo_pagamento: true,
                        status_pagamento: true
                    }
                }
            }
        });
        return caixa;
    }
};