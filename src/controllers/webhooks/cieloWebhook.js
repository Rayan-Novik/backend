import { PrismaClient } from '@prisma/client';
import PedidoModel from '../../models/pedidoModel.js';
import UsuarioModel from '../../models/usuarioModel.js';
import { registrarEntradaFinanceira } from '../../services/financialService.js';
import { notificarPagamentoAprovado } from './webhookHelper.js';

const prisma = new PrismaClient();

export const processarCielo = async (req, res) => {
    const { PaymentId, ChangeType } = req.body;
    if (!PaymentId) return res.status(400).send('PaymentId missing');

    try {
        const pedidoRelacionado = await prisma.pedidos.findFirst({
            where: { id_pagamento_gateway: String(PaymentId) }, select: { id_tenant: true }
        });
        if (!pedidoRelacionado) return res.status(200).send('OK');

        const id_tenant = pedidoRelacionado.id_tenant;
        const atualizado = await PedidoModel.updateStatusByGatewayId(PaymentId, 'PAGO', id_tenant); 
        
        if (atualizado) {
             console.log(`✅ [CIELO] Pedido ${atualizado.id_pedido} atualizado.`);
             const usuario = await prisma.usuarios.findUnique({ where: { id_usuario: atualizado.id_usuario } });
             await UsuarioModel.update(atualizado.id_usuario, { score_reputacao: (usuario?.score_reputacao || 50) + 5 }, id_tenant);

             await registrarEntradaFinanceira({
                id_pedido: atualizado.id_pedido, id_usuario: atualizado.id_usuario,
                gateway_provider: 'CIELO', gateway_id: PaymentId,
                valor_bruto: atualizado.preco_total, valor_taxa_real: null, id_tenant
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
        res.status(200).send('OK');
    } catch (error) {
        console.error("❌ Erro Webhook Cielo:", error.message);
        res.status(500).send('Error');
    }
};