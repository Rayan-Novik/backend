import { MercadoPagoConfig, Payment } from 'mercadopago';
import PedidoModel from '../models/pedidoModel.js';
import UsuarioModel from '../models/usuarioModel.js';
import EnderecoModel from '../models/enderecoModel.js';
import dotenv from 'dotenv';

dotenv.config();

const client = new MercadoPagoConfig({ 
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN 
});

export const handleMercadoPagoWebhook = async (req, res) => {
    const { query } = req;
    console.log("--- WEBHOOK DO MERCADO PAGO RECEBIDO ---");
    console.log("Query da notificação:", query);

    if (query.type === 'payment') {
        try {
            const payment_id = query['data.id'] || query.id;
            console.log(`Buscando informações do pagamento com ID: ${payment_id}`);

            const paymentApi = new Payment(client);
            const paymentInfo = await paymentApi.get({ id: payment_id });

            if (paymentInfo) {
                console.log("Informações do pagamento recebidas:", {
                    id: paymentInfo.id,
                    status: paymentInfo.status,
                    status_detail: paymentInfo.status_detail
                });

                const gatewayId = paymentInfo.id.toString();
                const status = paymentInfo.status === 'approved' ? 'PAGO' : 
                               paymentInfo.status === 'cancelled' ? 'CANCELADO' :
                               paymentInfo.status === 'rejected' ? 'REJEITADO' : 'PENDENTE';
                
                await PedidoModel.updatePaymentStatusByGatewayId(gatewayId, status);
                console.log(`✅ Sucesso! Status do pedido com ID de gateway ${gatewayId} atualizado para ${status}`);
            } else {
                console.warn(`Pagamento com ID ${payment_id} não encontrado no Mercado Pago.`);
            }
        } catch (error) {
            console.error("❌ Erro ao processar o webhook do Mercado Pago:", error);
            return res.sendStatus(500);
        }
    }
    // Responde 200 OK para confirmar o recebimento da notificação
    res.sendStatus(200);
};

export const handleMercadoLivreNotification = async (req, res, next) => {
    try {
        const notification = req.body;
        console.log('--- WEBHOOK DO MERCADO LIVRE RECEBIDO ---', notification);

        // O Mercado Livre envia notificações para vários eventos, filtramos apenas os de pedidos.
        if (notification.topic === 'orders_v2') {
            const accessToken = await getValidAccessToken();
            
            // Busca os detalhes completos do pedido na API do Mercado Livre
            const { data: orderData } = await axios.get(notification.resource, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            console.log('Detalhes do Pedido do ML:', orderData.id);

            // 1. Verifica se o pedido já existe no seu banco para evitar duplicados
            const pedidoExistente = await PedidoModel.findByGatewayId(String(orderData.id));

            if (!pedidoExistente) {
                // 2. Encontra ou cria o cliente no seu sistema
                let cliente = await UsuarioModel.findByEmail(orderData.buyer.email);
                if (!cliente) {
                    // Se o cliente não existe, cria um novo com uma senha padrão
                    cliente = await UsuarioModel.create({
                        nome_completo: `${orderData.buyer.first_name} ${orderData.buyer.last_name}`,
                        email: orderData.buyer.email,
                        // ATENÇÃO: Crie uma senha padrão segura ou um gerador de senhas
                        hash_senha: 'senha_padrao_mercado_livre', 
                        isAdmin: false
                    });
                }
                
                // 3. Cria um novo endereço de entrega para este pedido
                const shippingAddress = orderData.shipping.receiver_address;
                const enderecoCriado = await EnderecoModel.create({
                    id_usuario: cliente.id_usuario,
                    cep: shippingAddress.zip_code,
                    logradouro: shippingAddress.street_name,
                    numero: shippingAddress.street_number,
                    complemento: shippingAddress.comment,
                    bairro: shippingAddress.neighborhood.name,
                    cidade: shippingAddress.city.name,
                    estado: shippingAddress.state.id.replace('BR-', ''), // Remove o prefixo 'BR-'
                    is_principal: false
                });

                // 4. Mapeia os itens do pedido do ML para o formato do seu sistema
                const itemsDoPedido = orderData.order_items.map(item => ({
                    produtos: { // Mock da estrutura que o PedidoModel.create espera
                        id_produto: null, // O produto pode não existir no seu catálogo
                        nome: item.item.title,
                        preco: item.unit_price,
                        imagem_url: item.item.picture_url || null
                    },
                    quantidade: item.quantity,
                }));
                
                const statusPagamento = orderData.payments[0]?.status === 'approved' ? 'PAGO' : 'PENDENTE';
                const statusEntrega = statusPagamento === 'PAGO' ? 'Em processamento' : 'Pendente';

                // 5. Cria o pedido no seu banco de dados
                await PedidoModel.create({
                    id_usuario: cliente.id_usuario,
                    id_endereco_entrega: enderecoCriado.id_endereco,
                    metodo_pagamento: orderData.payments[0]?.payment_method_id || 'mercadolivre',
                    preco_itens: orderData.total_amount - (orderData.shipping.cost || 0),
                    preco_frete: orderData.shipping.cost || 0,
                    preco_total: orderData.total_amount,
                    status_pagamento: statusPagamento,
                    id_pagamento_gateway: String(orderData.id),
                    status_entrega: statusEntrega,
                    canal_venda: 'Mercado Livre', // Identifica a origem do pedido
                }, itemsDoPedido);
                
                console.log(`✅ Pedido #${orderData.id} do Mercado Livre criado com sucesso!`);
            } else {
                console.log(`Pedido #${orderData.id} do Mercado Livre já existe no sistema. Ignorando.`);
            }
        }
        
        // Responde ao Mercado Livre para confirmar que a notificação foi recebida
        res.status(200).send('Notificação recebida.');
    } catch (error) {
        console.error('❌ Erro ao processar webhook do Mercado Livre:', error.message);
        next(error);
    }
};
