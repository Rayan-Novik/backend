import { getSession } from './connection.js';
import { PrismaClient } from '@prisma/client';
import { format } from 'date-fns';

const prisma = new PrismaClient();

// 🟢 1. FUNÇÃO BASE DE ENVIO (COM BLINDAGEM)
export const sendWhatsAppMessage = async (phone, contentOptions, id_tenant) => {
    const session = getSession(id_tenant);

    if (!session || !session.sock || session.status !== 'CONNECTED') {
        console.warn(`⚠️ [Tenant ${id_tenant}] WhatsApp não está conectado. Mensagem ignorada.`);
        return false;
    }
    if (!phone) return false;

    try {
        let formattedPhone = String(phone).replace(/\D/g, '');
        if (!formattedPhone.startsWith('55')) formattedPhone = '55' + formattedPhone;
        const jid = `${formattedPhone}@s.whatsapp.net`;

        const [result] = await session.sock.onWhatsApp(jid);
        if (result && result.exists) {
            await session.sock.sendMessage(result.jid, contentOptions);
            console.log(`✅ [Tenant ${id_tenant}] WhatsApp enviado para: ${formattedPhone}`);
            return true;
        } else {
            console.warn(`❌ [Tenant ${id_tenant}] Número sem WhatsApp: ${formattedPhone}`);
            return false;
        }
    } catch (error) {
        console.error(`❌ [Tenant ${id_tenant}] Erro no WhatsApp:`, error);
        return false;
    }
};

export const sendCRMMessage = async (jid, contentOptions, id_tenant) => {
    const session = getSession(id_tenant);
    if (!session || !session.sock || session.status !== 'CONNECTED') return false;

    try {
        // Envie exatamente o que chegou, sem alterar o texto
        const result = await session.sock.sendMessage(jid, contentOptions);
        console.log(`💬 [Tenant ${id_tenant}] CRM enviou para: ${jid}`);
        return result; 
    } catch (error) {
        console.error(`❌ [Tenant ${id_tenant}] Erro CRM Envio:`, error);
        return false;
    }
};

export const deleteWhatsAppMessage = async (id_tenant, jid, messageId) => {
    const session = getSession(id_tenant);
    if (!session || !session.sock || session.status !== 'CONNECTED') return false;

    try {
        // A chave exata da mensagem que queremos apagar (tem que ser uma enviada por você: fromMe = true)
        const key = { remoteJid: jid, fromMe: true, id: messageId };
        await session.sock.sendMessage(jid, { delete: key });
        console.log(`🗑️ [Tenant ${id_tenant}] Mensagem deletada: ${messageId}`);
        return true;
    } catch (error) {
        console.error(`❌ [Tenant ${id_tenant}] Erro ao deletar mensagem:`, error);
        return false;
    }
};

// 🟢 6. FUNÇÃO: EDITAR MENSAGEM
export const editWhatsAppMessage = async (id_tenant, jid, messageId, newText) => {
    const session = getSession(id_tenant);
    if (!session || !session.sock || session.status !== 'CONNECTED') return false;

    try {
        const key = { remoteJid: jid, fromMe: true, id: messageId };
        await session.sock.sendMessage(jid, { text: newText, edit: key });
        console.log(`✏️ [Tenant ${id_tenant}] Mensagem editada: ${messageId}`);
        return true;
    } catch (error) {
        console.error(`❌ [Tenant ${id_tenant}] Erro ao editar mensagem:`, error);
        return false;
    }
};

// 🟢 2. FUNÇÃO: AVISO PARA O DONO DA LOJA (USANDO O MASTER)
export const sendStoreNotification = async (pedidoId, id_tenant) => {
    try {
        const [loja, pedido] = await Promise.all([
            prisma.tenants.findUnique({
                where: { id: Number(id_tenant) },
                select: { telefone_contato: true, nome_fantasia: true }
            }),
            prisma.pedidos.findUnique({
                where: { id_pedido: Number(pedidoId) },
                include: {
                    usuarios: true, 
                    pedido_items: { include: { produtos: true } },
                    enderecos: true
                }
            })
        ]);

        if (!loja || !loja.telefone_contato || !pedido) return false;

        const comprador = pedido.usuarios;
        const totalFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pedido.preco_total);

        let msgLojista = `🚨 *NOVA VENDA REALIZADA!* 🚨\n\n`;
        msgLojista += `Parabéns, a loja *${loja.nome_fantasia}* acabou de receber um novo pedido.\n\n`;
        msgLojista += `*Pedido:* #${pedido.id_pedido}\n`;
        msgLojista += `*Cliente:* ${comprador.nome_completo}\n`;
        msgLojista += `*Valor Total:* ${totalFormatado}\n`;
        msgLojista += `*Método:* ${pedido.metodo_pagamento}\n\n`;
        
        msgLojista += `🛍️ *Itens:*\n`;
        pedido.pedido_items.forEach(item => {
            msgLojista += `- ${item.quantidade}x ${item.produtos.nome}\n`;
        });

        const baseUrl = process.env.FRONTEND_URL?.replace(/\/$/, '') || 'https://www.manateechat.shop';
        const urlPainel = `${baseUrl}/admin/orders/${pedido.id_pedido}`;

        msgLojista += `\nGerencie este pedido no seu painel:\n${urlPainel}`;

        // ⚠️ IMPORTANTE: Sempre tenta usar a sessão MASTER para avisar o dono!
        const enviou = await sendWhatsAppMessage(loja.telefone_contato, { text: msgLojista }, 'MASTER');
        
        if (enviou) {
            console.log(`✅ Notificação enviada ao Lojista (Tenant ${id_tenant}) via MASTER`);
        } else {
            console.log(`⚠️ Falha ao notificar lojista (Tenant ${id_tenant}) via MASTER`);
        }

        return enviou;
    } catch (error) {
        console.error('❌ Erro ao notificar lojista:', error);
        return false;
    }
};

// 🟢 3. FUNÇÃO: RECIBO E CONFIRMAÇÃO PARA O CLIENTE FINAL (Mantém a sua que dá erro se não existir)
export const sendOrderConfirmation = async (telefone, pedido, id_tenant) => {
    // Redireciona para a mesma lógica do Recibo (Para cobrir o "import" do seu controller antigo)
    return sendWhatsAppPaymentReceipt(telefone, pedido, pedido.usuarios, pedido.pedido_items, '', id_tenant, 'Sua Loja');
};

// 🟢 4. FUNÇÃO: RECIBO DE PAGAMENTO DETALHADO (A que você usa no controller atualizado)
export const sendWhatsAppPaymentReceipt = async (telefoneLimpo, pedidoCriado, usuario, carrinhoItens, linkAcompanhamento, id_tenant, nomeDaLoja) => {
    try {
        if (!telefoneLimpo) return false;

        const dataFormatada = format(new Date(), 'dd/MM/yyyy, HH:mm:ss');
        const valorFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pedidoCriado.preco_total);
        const freteFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pedidoCriado.preco_frete || 0);

        let itensText = '';
        carrinhoItens.forEach(item => {
            itensText += `${item.quantidade}x ${item.produtos.nome} - ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.produtos.preco)}\n`;
        });

        let enderecoText = 'Retirada na Loja';
        if (pedidoCriado.entrega_logradouro) {
            enderecoText = `${pedidoCriado.entrega_logradouro}, ${pedidoCriado.entrega_numero}\n`;
            if (pedidoCriado.entrega_complemento) enderecoText += `${pedidoCriado.entrega_complemento}\n`;
            enderecoText += `${pedidoCriado.entrega_bairro} - ${pedidoCriado.entrega_cidade}/${pedidoCriado.entrega_estado}\n`;
            enderecoText += `CEP: ${pedidoCriado.entrega_cep}`;
        }

        const msgCliente = 
`✅ *PEDIDO RECEBIDO - ${nomeDaLoja.toUpperCase()}!*
Olá, ${usuario.nome_completo.split(' ')[0]}! Seu pedido foi confirmado.

🧾 *DETALHES DO PEDIDO #${pedidoCriado.id_pedido || pedidoCriado.id}*
📅 Data: ${dataFormatada}
💳 Pagamento: ${pedidoCriado.metodo_pagamento} 

🛍️ *ITENS DO PEDIDO:*
${itensText}
---------------------------------
Subtotal: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pedidoCriado.preco_itens)}
Frete: ${freteFormatado}
*TOTAL A PAGAR: ${valorFormatado}*

📍 *ENDEREÇO DE ENTREGA:*
${enderecoText}

🚚 *Acompanhe seu pedido online:*
${linkAcompanhamento}

Obrigado por comprar conosco! ❤️`;

        // Dispara para o cliente final (usando a sessão da loja dele)
        await sendWhatsAppMessage(telefoneLimpo, { text: msgCliente }, id_tenant);
        return true;
    } catch (error) {
        console.error(`❌ Erro ao enviar recibo via WhatsApp (Tenant ${id_tenant}):`, error);
        return false;
    }
};