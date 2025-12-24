import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { sendAbandonedCartEmail, sendPendingPaymentEmail } from './emailService.js';

const prisma = new PrismaClient();

// --- Tarefas Agendadas ---

// 1. Lembrete de Carrinho Abandonado
// ✅ Adicionado 'export' para que o botController possa usar esta função para testes.
export const handleAbandonedCarts = async () => {
    console.log('🤖 Verificando carrinhos abandonados...');
    
    // Procura por carrinhos criados entre 2 e 24 horas atrás para não incomodar o cliente
    // Para testar, você pode descomentar as linhas de minutos e comentar as de horas.
    // const twoMinutesAgo = new Date(new Date().getTime() - (2 * 60 * 1000));
    // const oneHourAgo = new Date(new Date().getTime() - (60 * 60 * 1000));
    const twoHoursAgo = new Date(new Date().getTime() - (2 * 60 * 60 * 1000));
    const twentyFourHoursAgo = new Date(new Date().getTime() - (24 * 60 * 60 * 1000));

    const abandonedCarts = await prisma.carrinhos.findMany({
        where: {
            data_adicionado: {
                lt: twoHoursAgo, // Use twoMinutesAgo para testar
                gte: twentyFourHoursAgo, // Use oneHourAgo para testar
            },
        },
        include: {
            usuarios: true,
            produtos: {
                include: {
                    imagens: { take: 1, orderBy: { ordem: 'asc' } }
                }
            }
        }
    });

    if (abandonedCarts.length > 0) {
        console.log(`Encontrados ${abandonedCarts.length} carrinhos para notificar.`);
        const userCarts = {};
        abandonedCarts.forEach(item => {
            if (!userCarts[item.id_usuario]) {
                userCarts[item.id_usuario] = { user: item.usuarios, items: [] };
            }
            userCarts[item.id_usuario].items.push(item.produtos);
        });

        for (const userId in userCarts) {
            const { user, items } = userCarts[userId];
            await sendAbandonedCartEmail(user, items);
        }
    }
};

// 2. Lembrete de Pagamento Pendente ou Recusado
// ✅ Adicionado 'export' para que o botController possa usar esta função para testes.
export const handlePendingPayments = async () => {
    console.log('🤖 Verificando pagamentos pendentes ou recusados...');
    const fortyEightHoursAgo = new Date(new Date().getTime() - (48 * 60 * 60 * 1000));

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
        }
    });

    if (pendingOrders.length > 0) {
        console.log(`Encontrados ${pendingOrders.length} pedidos pendentes/recusados para notificar.`);
        for (const order of pendingOrders) {
            await sendPendingPaymentEmail(order.usuarios, order);
        }
    }
};

// 3. Lembrete de Produtos Vistos Recentemente (Sugestão)
const handlePopularProductsReminder = async () => {
    console.log('🤖 Verificando usuários para enviar lembrete de produtos populares...');
    
    const sevenDaysAgo = new Date(new Date().getTime() - (7 * 24 * 60 * 60 * 1000));

    // Pega usuários que não compram há algum tempo
    const inactiveUsers = await prisma.usuarios.findMany({
        where: {
            pedidos: {
                none: {
                    data_pedido: { gte: sevenDaysAgo }
                }
            },
            isAdmin: false,
        }
    });
    
    // Pega os 5 produtos mais vistos
    const popularProducts = await prisma.produtos.findMany({
        orderBy: { visualizacoes: 'desc' },
        take: 5,
        include: {
            imagens: { take: 1, orderBy: { ordem: 'asc' } }
        }
    });

    // Esta lógica pode ser ativada no futuro
    // if (inactiveUsers.length > 0 && popularProducts.length > 0) {
    //     for (const user of inactiveUsers) {
    //         // Enviar email com produtos populares
    //     }
    // }
};


/**
 * A função principal que inicia o bot.
 * Ela agenda as tarefas para rodarem em intervalos definidos.
 */
export const startBot = () => {
    console.log('✅ Bot de Vendas iniciado. As tarefas serão executadas nos horários agendados.');

    // Agenda a verificação de carrinhos abandonados para rodar a cada hora.
    cron.schedule('30 * * * *', handleAbandonedCarts);

    // Agenda a verificação de pagamentos pendentes para rodar duas vezes ao dia
    cron.schedule('0 10,18 * * *', handlePendingPayments);
};

