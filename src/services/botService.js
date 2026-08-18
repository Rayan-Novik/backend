import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { sendAbandonedCartEmail, sendPendingPaymentEmail } from './emailService.js'; 
import { connectWhatsApp } from './whatsapp/connection.js';

const prisma = new PrismaClient();

export const handleAbandonedCarts = async (id_tenant = null) => {
    console.log(`🤖 Bot: Verificando carrinhos abandonados${id_tenant ? ` (Loja ${id_tenant})` : ''}...`);
    
    const twoHoursAgo = new Date(Date.now() - (2 * 60 * 60 * 1000));
    const twentyFourHoursAgo = new Date(Date.now() - (24 * 60 * 60 * 1000));

    try {
        const whereClause = {
            data_adicionado: { lt: twoHoursAgo, gte: twentyFourHoursAgo }
        };
        if (id_tenant) whereClause.id_tenant = id_tenant;

        const abandonedCarts = await prisma.carrinhos.findMany({
            where: whereClause,
            include: {
                usuarios: true,
                produtos: {
                    include: {
                        produto_subimagens: { 
                            take: 1, 
                            orderBy: { ordem: 'asc' },
                            select: { url: true } 
                        }
                    }
                }
            }
        });

        if (abandonedCarts.length > 0) {
            const tenantUserCarts = {};
            
            abandonedCarts.forEach(item => {
                if (!item.usuarios) return; 

                const key = `${item.id_tenant}_${item.id_usuario}`;
                if (!tenantUserCarts[key]) {
                    tenantUserCarts[key] = { id_tenant: item.id_tenant, user: item.usuarios, items: [] };
                }
                tenantUserCarts[key].items.push(item.produtos);
            });

            for (const key in tenantUserCarts) {
                const { id_tenant: tenantId, user, items } = tenantUserCarts[key];
                await sendAbandonedCartEmail(user, items, tenantId);
            }
        }
    } catch (error) {
        console.error('❌ Erro no Bot de Carrinho:', error);
    }
};

export const handlePendingPayments = async (id_tenant = null) => {
    console.log(`🤖 Bot: Verificando pagamentos pendentes${id_tenant ? ` (Loja ${id_tenant})` : ''}...`);
    
    const fortyEightHoursAgo = new Date(Date.now() - (48 * 60 * 60 * 1000));

    try {
        const whereClause = {
            status_pagamento: { in: ['PENDENTE', 'REJEITADO'] },
            data_pedido: { gte: fortyEightHoursAgo }
        };
        if (id_tenant) whereClause.id_tenant = id_tenant;

        const pendingOrders = await prisma.pedidos.findMany({
            where: whereClause,
            include: {
                usuarios: true
            }
        });

        if (pendingOrders.length > 0) {
            for (const order of pendingOrders) {
                if (order.usuarios) {
                    await sendPendingPaymentEmail(order.usuarios, order, order.id_tenant);
                }
            }
        }
    } catch (error) {
        console.error('❌ Erro no Bot de Pagamentos:', error);
    }
};

export const startBot = () => {
    console.log('✅ Bot de Vendas iniciado. Cron Jobs ativos.');

    connectWhatsApp();

    cron.schedule('30 * * * *', () => handleAbandonedCarts());

    cron.schedule('0 10,18 * * *', () => handlePendingPayments());
};