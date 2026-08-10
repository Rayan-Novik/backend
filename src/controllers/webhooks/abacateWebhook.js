import crypto from 'crypto'; 
import { PrismaClient } from '@prisma/client';
import PedidoModel from '../../models/pedidoModel.js';
import UsuarioModel from '../../models/usuarioModel.js';
import ConfiguracaoModel from '../../models/configuracaoModel.js';
import { registrarEntradaFinanceira } from '../../services/financialService.js';
import { notificarPagamentoAprovado } from './webhookHelper.js';

const prisma = new PrismaClient();

export const processarAbacate = async (req, res) => {
    try {
        const { event, data } = req.body;
        const gatewayId = data?.billing?.id || data?.id;
        if (!gatewayId) return res.status(200).json({ received: true });

        const pedidoRelacionado = await prisma.pedidos.findFirst({
            where: { id_pagamento_gateway: String(gatewayId) }, select: { id_tenant: true }
        });
        if (!pedidoRelacionado) return res.status(200).json({ received: true });

        const id_tenant = pedidoRelacionado.id_tenant;
        const webhookSecret = await ConfiguracaoModel.get('ABACATEPAY_WEBHOOK_SECRET', id_tenant);
        const signature = req.headers['abacatepay-signature'] || req.headers['x-signature'];

        if (webhookSecret && signature) {
            const hmac = crypto.createHmac('sha256', webhookSecret);
            const digest = hmac.update(JSON.stringify(req.body)).digest('hex');
            if (signature !== digest && signature !== `sha256=${digest}`) return res.status(401).json({ error: "Invalid Signature" });
        }
        
        if (event === 'billing.paid') {
            const atualizado = await PedidoModel.updateStatusByGatewayId(gatewayId, 'PAGO', id_tenant);

            if (atualizado) {
                console.log(`✅ [ABACATE] Pedido ${atualizado.id_pedido} PAGO.`);
                const usuario = await prisma.usuarios.findUnique({ where: { id_usuario: atualizado.id_usuario } });
                await UsuarioModel.update(atualizado.id_usuario, { score_reputacao: (usuario?.score_reputacao || 50) + 10 }, id_tenant);

                await registrarEntradaFinanceira({
                    id_pedido: atualizado.id_pedido, id_usuario: atualizado.id_usuario,
                    gateway_provider: 'ABACATEPAY', gateway_id: String(gatewayId),
                    valor_bruto: atualizado.preco_total, valor_taxa_real: 0, id_tenant
                });

                // 🟢 ERP: CONCILIAÇÃO AUTOMÁTICA
                try {
                    await prisma.financeiro_contas_receber.updateMany({
                        where: { id_pedido: atualizado.id_pedido, id_tenant, status: { not: 'PAGO' } },
                        data: { status: 'PAGO', data_baixa: new Date(), valor_pago: atualizado.preco_total }
                    });
                } catch (err) { console.error("⚠️ Erro na conciliação:", err.message); }

                await notificarPagamentoAprovado(atualizado, id_tenant);
            }
        }
        return res.status(200).json({ received: true });
    } catch (error) {
        console.error("❌ Erro Webhook Abacate:", error);
        return res.status(500).json({ error: "Internal Error" });
    }
};