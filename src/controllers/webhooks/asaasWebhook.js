import { PrismaClient } from '@prisma/client';
import PedidoModel from '../../models/pedidoModel.js';
import UsuarioModel from '../../models/usuarioModel.js';
import { registrarEntradaFinanceira } from '../../services/financialService.js';
import { notificarPagamentoAprovado } from './webhookHelper.js';

const prisma = new PrismaClient();

export const processarAsaas = async (req, res) => {
    try {
        const { event, payment } = req.body;
        const gatewayId = payment?.id;
        if (!gatewayId) return res.status(200).send('OK');

        if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED') {
            const pedidoRelacionado = await prisma.pedidos.findFirst({
                where: { id_pagamento_gateway: String(gatewayId) }, select: { id_tenant: true }
            });
            if (!pedidoRelacionado) return res.status(200).send('OK');

            const id_tenant = pedidoRelacionado.id_tenant;
            const atualizado = await PedidoModel.updateStatusByGatewayId(gatewayId, 'PAGO', id_tenant);

            if (atualizado) {
                console.log(`✅ [ASAAS] Pedido ${atualizado.id_pedido} PAGO.`);
                const usuario = await prisma.usuarios.findUnique({ where: { id_usuario: atualizado.id_usuario } });
                await UsuarioModel.update(atualizado.id_usuario, { score_reputacao: (usuario?.score_reputacao || 50) + 5 }, id_tenant);

                const valorBruto = Number(payment.value);
                const valorLiquido = Number(payment.netValue);
                const taxaReal = valorBruto - valorLiquido;

                await registrarEntradaFinanceira({
                    id_pedido: atualizado.id_pedido, id_usuario: atualizado.id_usuario,
                    gateway_provider: 'ASAAS', gateway_id: gatewayId,
                    valor_bruto: valorBruto, valor_taxa_real: taxaReal, id_tenant
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
        console.error("❌ Erro Webhook Asaas:", error.message);
        res.status(500).send('Server Error');
    }
};