import axios from 'axios';
import { getValidIfoodToken } from './ifoodService.js';

const IFOOD_API = 'https://merchant-api.ifood.com.br';

export const enviarMensagemAoCliente = async (tenantId, ifoodOrderId, textoMensagem) => {
    const token = await getValidIfoodToken(tenantId);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

    // 1. Descobre qual é o "chatId" secreto gerado para este pedido específico
    const { data: conversas } = await axios.get(`${IFOOD_API}/chat/v1.0/orders/${ifoodOrderId}`, { headers });

    if (!conversas || conversas.length === 0) {
        throw new Error("O canal de chat para este pedido já foi encerrado pelo iFood.");
    }

    const chatId = conversas[0].id;

    // 2. Manda a mensagem
    await axios.post(`${IFOOD_API}/chat/v1.0/chats/${chatId}/messages`, {
        message: textoMensagem
    }, { headers });

    return { sucesso: true };
};