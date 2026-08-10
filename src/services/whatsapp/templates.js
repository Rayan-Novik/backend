import PDFDocument from 'pdfkit';
import { sendWhatsAppMessage } from './sender.js';

// ============================================================================
// 1. MENSAGEM DE TEXTO SIMPLES
// ============================================================================
export const enviarTextoGenerico = async (phone, texto, id_tenant) => {
    return await sendWhatsAppMessage(phone, { text: texto }, id_tenant);
};

// ============================================================================
// 2. RECIBO DO CLIENTE (TEXTO + PDF DA LOJA DELE)
// ============================================================================
export const sendWhatsAppPaymentReceipt = async (phone, pedido, cliente, itens, linkRastreio, id_tenant) => {
    if (!phone) return false;

    try {
        const primeiroNome = cliente.nome_completo.split(' ')[0];
        const dataPedido = pedido.data_pedido ? new Date(pedido.data_pedido).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR');
        const isOffline = pedido.metodo_pagamento && pedido.metodo_pagamento.toUpperCase().includes('OFFLINE');
        const metodoPagamento = pedido.metodo_pagamento ? pedido.metodo_pagamento.toUpperCase() : 'N/A';
        const gatewayId = pedido.id_pagamento_gateway || (isOffline ? 'Pagamento Presencial' : 'N/A');
        const gatewayProvider = pedido.gateway_provider || '';

        const subtotal = parseFloat(pedido.preco_itens || 0);
        const frete = parseFloat(pedido.preco_frete || 0);
        const total = parseFloat(pedido.preco_total || 0);
        const desconto = (subtotal + frete) - total;

        let enderecoStr = 'Retirada na Loja';
        if (pedido.entrega_logradouro) {
            enderecoStr = `${pedido.entrega_logradouro}, ${pedido.entrega_numero || 'S/N'}\n`;
            if (pedido.entrega_complemento) enderecoStr += `${pedido.entrega_complemento}\n`;
            enderecoStr += `${pedido.entrega_bairro} - ${pedido.entrega_cidade}/${pedido.entrega_estado}\nCEP: ${pedido.entrega_cep}`;
        }

        // --- PARTE 1: MONTAR A MENSAGEM DE TEXTO ---
        let notinhaText = isOffline ? `✅ *PEDIDO RECEBIDO!*\n` : `✅ *PAGAMENTO CONFIRMADO!*\n`;
        notinhaText += isOffline 
            ? `Olá, *${primeiroNome}*! Seu pedido foi confirmado. O pagamento será feito no ato da entrega.\n\n`
            : `Olá, *${primeiroNome}*! Seu pagamento foi aprovado com sucesso.\n\n`;
        
        notinhaText += `🧾 *DETALHES DO PEDIDO #${pedido.id_pedido || pedido.id}*\n`;
        notinhaText += `📅 Data: ${dataPedido}\n`;
        notinhaText += `💳 Pagamento: ${metodoPagamento} ${gatewayProvider && !isOffline ? `(${gatewayProvider})` : ''}\n`;
        if (!isOffline) notinhaText += `🔑 Transação: ${gatewayId}\n`;
        notinhaText += `\n🛍️ *ITENS DO PEDIDO:*\n`;
        
        itens.forEach(item => {
            const nome = item.produtos?.nome || item.nome || 'Produto';
            const preco = parseFloat(item.produtos?.preco || item.preco || 0).toFixed(2);
            notinhaText += `${item.quantidade}x ${nome} - R$ ${preco}\n`;
        });

        notinhaText += `---------------------------------\n`;
        notinhaText += `*Subtotal:* R$ ${subtotal.toFixed(2)}\n`;
        notinhaText += `*Frete:* R$ ${frete.toFixed(2)}\n`;
        if (desconto > 0.01) notinhaText += `*Desconto:* - R$ ${desconto.toFixed(2)}\n`;
        notinhaText += isOffline ? `*TOTAL A PAGAR:* R$ ${total.toFixed(2)}\n\n` : `*TOTAL PAGO:* R$ ${total.toFixed(2)}\n\n`;
        notinhaText += `📍 *ENDEREÇO DE ENTREGA:*\n${enderecoStr}\n\n`;
        notinhaText += `🚚 *Acompanhe seu pedido online:*\n${linkRastreio}\n\n`;
        notinhaText += `📄 _O PDF do seu recibo detalhado está no anexo abaixo._`;

        // 🟢 DISPARO 1 (Texto)
        await sendWhatsAppMessage(phone, { text: notinhaText }, id_tenant);

        // --- PARTE 2: GERAR O PDF ---
        const pdfBuffer = await new Promise((resolve) => {
            const doc = new PDFDocument({ margin: 30, size: [300, 650] }); 
            let buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            doc.fontSize(14).font('Helvetica-Bold').text(isOffline ? 'RESUMO DO PEDIDO' : 'COMPROVANTE DE PAGAMENTO', { align: 'center' });
            doc.moveDown(0.5);
            doc.fontSize(10).font('Helvetica');
            doc.text(`Pedido: #${pedido.id_pedido || pedido.id}`);
            doc.text(`Data: ${dataPedido}`);
            doc.text(`Cliente: ${cliente.nome_completo}`);
            doc.moveDown(0.5);
            
            doc.font('Helvetica-Bold').text(isOffline ? 'FORMA DE PAGAMENTO:' : 'DADOS DO PAGAMENTO:');
            doc.font('Helvetica');
            doc.text(`Método: ${metodoPagamento} ${gatewayProvider && !isOffline ? `(${gatewayProvider})` : ''}`);
            if (!isOffline) doc.text(`ID Transação: ${gatewayId}`);
            
            doc.moveDown(0.5);
            doc.text('---------------------------------------------------------', { align: 'center' });
            doc.moveDown(0.5);
            doc.font('Helvetica-Bold').text('ENDEREÇO DE ENTREGA:');
            doc.font('Helvetica').text(enderecoStr);
            doc.moveDown(0.5);
            doc.text('---------------------------------------------------------', { align: 'center' });
            doc.moveDown(0.5);
            doc.font('Helvetica-Bold').text('ITENS DO PEDIDO:');
            doc.font('Helvetica');
            doc.moveDown(0.3);

            itens.forEach(item => {
                const nome = item.produtos?.nome || item.nome || 'Produto';
                const totalItem = (item.quantidade * parseFloat(item.produtos?.preco || item.preco || 0)).toFixed(2);
                doc.text(`${item.quantidade}x ${nome}`);
                doc.text(`R$ ${totalItem}`, { align: 'right' });
                doc.moveDown(0.3);
            });

            doc.text('---------------------------------------------------------', { align: 'center' });
            doc.moveDown(0.5);
            doc.text(`Subtotal: R$ ${subtotal.toFixed(2)}`, { align: 'right' });
            doc.text(`Frete: R$ ${frete.toFixed(2)}`, { align: 'right' });
            if (desconto > 0.01) doc.text(`Desconto: - R$ ${desconto.toFixed(2)}`, { align: 'right' });
            
            doc.moveDown(0.5);
            const totalLabel = isOffline ? 'TOTAL A PAGAR:' : 'TOTAL PAGO:';
            doc.fontSize(12).font('Helvetica-Bold').text(`${totalLabel} R$ ${total.toFixed(2)}`, { align: 'right' });
            doc.moveDown(1);
            doc.fontSize(9).font('Helvetica-Oblique').text('Obrigado por comprar conosco!', { align: 'center' });

            doc.end();
        });

        // 🟢 DISPARO 2 (Envia o PDF)
        await sendWhatsAppMessage(phone, {
            document: pdfBuffer,
            mimetype: 'application/pdf',
            fileName: `Pedido_${pedido.id_pedido || pedido.id}.pdf`,
            caption: `Recibo Detalhado - Pedido #${pedido.id_pedido || pedido.id}`
        }, id_tenant);

        return true;

    } catch (error) {
        console.error(`❌ [Tenant ${id_tenant}] Erro ao enviar Recibo/PDF no WhatsApp:`, error);
        return false;
    }
};

// ============================================================================
// 3. AVISO PARA O LOJISTA (VIA MASTER)
// ============================================================================
export const enviarAlertaNovoPedidoLojista = async (telefoneLojista, pedido, cliente, nomeLoja) => {
    if (!telefoneLojista) return false;

    try {
        const total = parseFloat(pedido.preco_total || 0).toFixed(2);
        const metodo = pedido.metodo_pagamento || 'Não informado';
        
        let msg = `🚨 *NOVO PEDIDO NA SUA LOJA!* 🚨\n\n`;
        msg += `Olá, equipe da *${nomeLoja}*! Um novo pedido acabou de ser registrado no seu painel.\n\n`;
        msg += `📦 *Pedido:* #${pedido.id_pedido || pedido.id}\n`;
        msg += `👤 *Cliente:* ${cliente.nome_completo}\n`;
        msg += `💰 *Valor Total:* R$ ${total}\n`;
        msg += `💳 *Pagamento:* ${metodo} (${pedido.status_pagamento})\n\n`;
        msg += `💻 Acesse o painel do ArarinhaCloud para aceitar o pedido e iniciar o preparo!`;

        // 🚀 O SEGREDO: Dispara usando a sessão 'MASTER' (O seu celular do SaaS)
        await sendWhatsAppMessage(telefoneLojista, { text: msg }, 'MASTER');
        return true;
    } catch (error) {
        console.error(`❌ Erro ao alertar lojista via MASTER:`, error);
        return false;
    }
};