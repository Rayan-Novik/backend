import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { sendAbandonedCartEmail, sendPendingPaymentEmail } from './emailService.js'; 

const prisma = new PrismaClient();

// --- Tarefas Agendadas ---

/**
 * 1. Lembrete de Carrinho Abandonado
 * Regra: Carrinhos criados entre 2 e 24 horas atrás.
 */
export const handleAbandonedCarts = async () => {
    console.log('🤖 Bot: Verificando carrinhos abandonados...');
    
    // Intervalo de tempo (janela de 2h a 24h atrás)
    const twoHoursAgo = new Date(new Date().getTime() - (2 * 60 * 60 * 1000));
    const twentyFourHoursAgo = new Date(new Date().getTime() - (24 * 60 * 60 * 1000));

    try {
        const abandonedCarts = await prisma.carrinhos.findMany({
            where: {
                data_adicionado: {
                    lt: twoHoursAgo,
                    gte: twentyFourHoursAgo,
                },
            },
            include: {
                usuarios: true,
                produtos: {
                    include: {
                        // ✅ CORREÇÃO AQUI:
                        // O nome correto no seu schema é 'produto_subimagens', não 'imagens'.
                        // O 'imagem_url' (capa principal) já vem por padrão dentro de 'produtos'.
                        produto_subimagens: { 
                            take: 1, 
                            orderBy: { ordem: 'asc' },
                            select: { url: true } // Traz apenas a URL para ficar leve
                        }
                    }
                }
            }
        });

        if (abandonedCarts.length > 0) {
            console.log(`📦 Encontrados ${abandonedCarts.length} itens em carrinhos abandonados.`);
            
            // Agrupa os itens por usuário
            const userCarts = {};
            
            abandonedCarts.forEach(item => {
                // Segurança: Se o usuário foi deletado, ignora
                if (!item.usuarios) return; 

                if (!userCarts[item.id_usuario]) {
                    userCarts[item.id_usuario] = { user: item.usuarios, items: [] };
                }
                userCarts[item.id_usuario].items.push(item.produtos);
            });

            // Envia um e-mail único por usuário
            for (const userId in userCarts) {
                const { user, items } = userCarts[userId];
                console.log(`✉️ Enviando lembrete de carrinho para: ${user.email}`);
                await sendAbandonedCartEmail(user, items);
            }
        } else {
            console.log('🤖 Nenhum carrinho abandonado encontrado neste ciclo.');
        }
    } catch (error) {
        console.error('❌ Erro Crítico no Bot de Carrinho:', error);
    }
};

/**
 * 2. Lembrete de Pagamento Pendente
 * Regra: Pedidos feitos há mais de 48h que ainda não foram pagos.
 */
export const handlePendingPayments = async () => {
    console.log('🤖 Bot: Verificando pagamentos pendentes...');
    
    // Pedidos mais antigos que 48 horas
    const fortyEightHoursAgo = new Date(new Date().getTime() - (48 * 60 * 60 * 1000));

    try {
        const pendingOrders = await prisma.pedidos.findMany({
            where: {
                status_pagamento: {
                    in: ['PENDENTE', 'REJEITADO'],
                },
                data_pedido: {
                    gte: fortyEightHoursAgo 
                }
            },
            include: {
                usuarios: true
                // Não precisamos incluir produtos aqui pois o e-mail de pagamento pendente 
                // geralmente foca no VALOR TOTAL e no LINK DE PAGAMENTO.
            }
        });

        if (pendingOrders.length > 0) {
            console.log(`💸 Encontrados ${pendingOrders.length} pedidos com pagamento pendente.`);
            
            for (const order of pendingOrders) {
                if (order.usuarios) {
                    console.log(`✉️ Enviando lembrete de pagamento para: ${order.usuarios.email}`);
                    await sendPendingPaymentEmail(order.usuarios, order);
                }
            }
        } else {
            console.log('🤖 Nenhum pagamento pendente crítico encontrado.');
        }
    } catch (error) {
        console.error('❌ Erro Crítico no Bot de Pagamentos:', error);
    }
};

/**
 * Função Principal que Inicia o Agendamento (CRON)
 */
export const startBot = () => {
    console.log('✅ Bot de Vendas iniciado. Cron Jobs ativos.');

    // Agenda: Carrinhos Abandonados -> Roda todo minuto 30 de cada hora
    cron.schedule('30 * * * *', handleAbandonedCarts);

    // Agenda: Pagamentos Pendentes -> Roda às 10:00 e às 18:00 todos os dias
    cron.schedule('0 10,18 * * *', handlePendingPayments);
};