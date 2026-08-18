import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';
import PedidoModel from '../../models/pedidoModel.js';
import UsuarioModel from '../../models/usuarioModel.js';
import ConfiguracaoModel from '../../models/configuracaoModel.js';
import { registrarEntradaFinanceira } from '../../services/financialService.js';
import { notificarPagamentoAprovado } from './webhookHelper.js';

const prisma = new PrismaClient();

export const processarStripe = async (req, res) => {
    try {
        let bodyParsed;
        try { bodyParsed = typeof req.body === 'string' || Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body; } 
        catch (e) { return res.status(400).send('Invalid body'); }

        const gatewayId = bodyParsed?.data?.object?.id;
        if (!gatewayId) return res.status(200).send('OK');

        const pedidoRelacionado = await prisma.pedidos.findFirst({
            where: { id_pagamento_gateway: String(gatewayId) }, select: { id_tenant: true }
        });
        if (!pedidoRelacionado) return res.status(200).send('OK');

        const id_tenant = pedidoRelacionado.id_tenant;
        const sig = req.headers['stripe-signature'];
        const endpointSecret = await ConfiguracaoModel.get('STRIPE_WEBHOOK_SECRET', id_tenant);
        const stripeKey = await ConfiguracaoModel.get('STRIPE_SECRET_KEY', id_tenant);

        if (!stripeKey) return res.status(500).send('Stripe Key not found');
        const stripe = new Stripe(stripeKey);
        let event;

        try {
            if (endpointSecret && typeof req.body !== 'object') event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
            else event = bodyParsed; 
        } catch (err) { return res.status(400).send(`Webhook Error: ${err.message}`); }

        if (event.type === 'payment_intent.succeeded' || event.type === 'checkout.session.completed') {
            const paymentIntent = event.data.object;
            const atualizado = await PedidoModel.updateStatusByGatewayId(gatewayId, 'PAGO', id_tenant);

            if (atualizado) {
                console.log(`✅ [STRIPE] Pedido ${atualizado.id_pedido} PAGO.`);
                const usuario = await prisma.usuarios.findUnique({ where: { id_usuario: atualizado.id_usuario } });
                await UsuarioModel.update(atualizado.id_usuario, { score_reputacao: (usuario?.score_reputacao || 50) + 5 }, id_tenant);

                const valorBruto = paymentIntent.amount_received ? (paymentIntent.amount_received / 100) : atualizado.preco_total;
                
                await registrarEntradaFinanceira({
                    id_pedido: atualizado.id_pedido, id_usuario: atualizado.id_usuario,
                    gateway_provider: 'STRIPE', gateway_id: gatewayId,
                    valor_bruto: valorBruto, valor_taxa_real: null, id_tenant
                });

                // 🟢 ERP: CONCILIAÇÃO AUTOMÁTICA
                try {
                    await prisma.financeiro_contas_receber.updateMany({
                        where: { id_pedido: atualizado.id_pedido, id_tenant, status: { not: 'PAGO' } },
                        data: { status: 'PAGO', data_baixa: new Date(), valor_pago: valorBruto }
                    });
                } catch (err) { console.error("⚠️ Erro na conciliação:", err.message); }

                await notificarPagamentoAprovado(atualizado, id_tenant);
            }
        }
        res.json({ received: true });
    } catch (error) {
        console.error("❌ Erro Webhook Stripe:", error.message);
        res.status(500).send('Server Error');
    }
};