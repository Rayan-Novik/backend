import { MercadoPagoConfig, Payment } from 'mercadopago';
import { PrismaClient } from '@prisma/client';
import PedidoModel from '../../models/pedidoModel.js';
import UsuarioModel from '../../models/usuarioModel.js';
import ConfiguracaoModel from '../../models/configuracaoModel.js';
import { registrarEntradaFinanceira } from '../../services/financialService.js';
import { notificarPagamentoAprovado } from './webhookHelper.js';

const prisma = new PrismaClient();

export const processarMercadoPago = async (req, res) => {
    const paymentId = req.query['data.id'] || req.query.id;
    const type = req.query.type || req.query.topic;

    if (type === 'payment' && paymentId) {
        try {
            console.log(`--- WEBHOOK MP: Processando Pagamento ${paymentId} ---`);
            await new Promise(resolve => setTimeout(resolve, 3000));

            const pedidoRelacionado = await prisma.pedidos.findFirst({
                where: { id_pagamento_gateway: String(paymentId) },
                select: { id_tenant: true }
            });

            if (!pedidoRelacionado) return res.status(200).send('OK');
            const id_tenant = pedidoRelacionado.id_tenant;

            const accessToken = await ConfiguracaoModel.get('MERCADOPAGO_ACCESS_TOKEN', id_tenant);
            if (!accessToken) return res.status(500).send('Config Error');

            const client = new MercadoPagoConfig({ accessToken: accessToken.trim() });
            const payment = new Payment(client);
            const paymentData = await payment.get({ id: paymentId });

            let statusFinal = 'PENDENTE';
            if (paymentData.status === 'approved') statusFinal = 'PAGO';
            if (paymentData.status === 'cancelled' || paymentData.status === 'rejected') statusFinal = 'CANCELADO';

            const atualizado = await PedidoModel.updateStatusByGatewayId(String(paymentId), statusFinal, id_tenant);

            if (atualizado && statusFinal === 'PAGO') {
                console.log(`✅ [MP Tenant ${id_tenant}] Pedido ${atualizado.id_pedido} PAGO.`);
                
                const usuario = await prisma.usuarios.findUnique({ where: { id_usuario: atualizado.id_usuario } });
                await UsuarioModel.update(atualizado.id_usuario, { score_reputacao: (usuario?.score_reputacao || 50) + 5 }, id_tenant);

                const taxaTotal = paymentData.fee_details?.reduce((acc, fee) => acc + Number(fee.amount), 0) || 0;

                await registrarEntradaFinanceira({
                    id_pedido: atualizado.id_pedido, id_usuario: atualizado.id_usuario,
                    gateway_provider: 'MERCADOPAGO', gateway_id: String(paymentId),
                    valor_bruto: paymentData.transaction_amount, valor_taxa_real: taxaTotal, id_tenant
                });

                // 🟢 ERP: CONCILIAÇÃO AUTOMÁTICA
                try {
                    await prisma.financeiro_contas_receber.updateMany({
                        where: { id_pedido: atualizado.id_pedido, id_tenant, status: { not: 'PAGO' } },
                        data: { status: 'PAGO', data_baixa: new Date(), valor_pago: paymentData.transaction_amount }
                    });
                } catch (err) { console.error("⚠️ Erro na conciliação:", err.message); }

                await notificarPagamentoAprovado(atualizado, id_tenant);
            }
        } catch (error) {
            console.error("❌ Erro webhook MP:", error.message);
        }
    }
    return res.status(200).send('OK');
};