import axios from 'axios';
import { PrismaClient } from '@prisma/client';
// Ajustado o caminho para buscar o ifoodService uma pasta para trás (dependendo de onde você salvou)
import { getValidIfoodToken } from '../ifoodService.js'; 

const prisma = new PrismaClient();
const IFOOD_API = 'https://merchant-api.ifood.com.br';

// =====================================================================
// 🟢 1. O MOTOR DE POLLING (Roda no background a cada 30 segundos)
// =====================================================================
export const lerFilaDeEventos = async (tenantId) => {
    const token = await getValidIfoodToken(tenantId);
    const headers = { Authorization: `Bearer ${token}` };

    try {
        // 1. Pergunta pro iFood: "Tem evento novo pra essa loja?"
        const { data: eventos } = await axios.get(`${IFOOD_API}/order/v1.0/events:polling`, { headers });

        if (!eventos || eventos.length === 0) return [];

        const eventosParaReconhecer = [];

        for (const evento of eventos) {
            eventosParaReconhecer.push({ id: evento.id });

            // 🟢 NOVO PEDIDO CRIADO NO APP DO CLIENTE
            if (evento.code === 'PLC' || evento.code === 'PLACED') {
                await processarNovoPedido(tenantId, evento.orderId, headers);
            }

            // 🟢 PEDIDO CANCELADO PELA PLATAFORMA OU CLIENTE
            if (evento.code === 'CAN' || evento.code === 'CANCELLED') {
                await prisma.pedidos.updateMany({
                    where: { id_externo_ifood: evento.orderId, id_tenant: tenantId },
                    data: { status: 'CANCELADO' }
                });
            }

            // 🟢 CLIENTE MANDOU MENSAGEM NO CHAT
            if (evento.code === 'MESSAGE_CREATED') {
                console.log(`💬 Nova mensagem no pedido ${evento.orderId}`);
            }
        }

        // 2. 🚨 CRÍTICO: Avisa o iFood que salvamos os eventos (ACK)
        await axios.post(`${IFOOD_API}/order/v1.0/events/acknowledgment`, eventosParaReconhecer, { headers });

        return eventos;

    } catch (error) {
        if (error.response?.status === 204) return []; // 204 = Sem eventos novos (Normal)
        console.error(`[iFood Polling] Erro Tenant ${tenantId}:`, error.response?.data || error.message);
        throw error;
    }
};

// Função auxiliar interna para baixar o JSON completo do pedido
async function processarNovoPedido(tenantId, ifoodOrderId, headers) {
    const { data: pedidoIfood } = await axios.get(`${IFOOD_API}/order/v1.0/orders/${ifoodOrderId}`, { headers });

    await prisma.pedidos.create({
        data: {
            id_tenant: tenantId,
            id_externo_ifood: ifoodOrderId,
            display_id: pedidoIfood.displayId, 
            tipo_pedido: 'IFOOD',
            status: 'PEN', 
            valor_total: Number(pedidoIfood.total.orderAmount),
            nome_cliente: pedidoIfood.customer.name,
            telefone_cliente: pedidoIfood.customer.phone?.number || 'Não informado',
            json_completo: pedidoIfood 
        }
    });

    console.log(`[iFood] 📦 Novo pedido importado! #${pedidoIfood.displayId}`);
}

// =====================================================================
// 🟢 2. MUDAR STATUS DO PEDIDO (Enviar comando para o iFood)
// =====================================================================
export const despacharAcaoPedido = async (tenantId, ifoodOrderId, acao) => {
    const token = await getValidIfoodToken(tenantId);

    try {
        await axios.post(`${IFOOD_API}/order/v1.0/orders/${ifoodOrderId}/${acao}`, {}, {
            headers: { Authorization: `Bearer ${token}` }
        });

        return true;
    } catch (error) {
        console.error(`Erro ao disparar ação [${acao}] no pedido ${ifoodOrderId}:`, error.response?.data);
        throw new Error(`Falha no iFood: ${error.response?.data?.message || 'Ação recusada'}`);
    }
};