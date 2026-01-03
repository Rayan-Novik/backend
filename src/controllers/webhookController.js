import { MercadoPagoConfig, Payment } from 'mercadopago';
import axios from 'axios';
import PedidoModel from '../models/pedidoModel.js';
import UsuarioModel from '../models/usuarioModel.js';
import EnderecoModel from '../models/enderecoModel.js';
import ConfiguracaoModel from '../models/configuracaoModel.js'; // ✅ Adicionado import faltando

export const handleMercadoPagoWebhook = async (req, res) => {
    const paymentId = req.query['data.id'] || req.query.id;
    const type = req.query.type || req.query.topic;

    if (type === 'payment' && paymentId) {
        try {
            console.log(`--- WEBHOOK MP: Processando Pagamento ${paymentId} ---`);

            // ✅ Aguarda 3 segundos para garantir que o MP processou o ID em seus servidores
            await new Promise(resolve => setTimeout(resolve, 3000));

            // ✅ Busca o Access Token dinamicamente do banco
            const accessToken = await ConfiguracaoModel.get('MERCADOPAGO_ACCESS_TOKEN');
            
            if (!accessToken) {
                console.error("❌ Erro: MERCADOPAGO_ACCESS_TOKEN não encontrado no banco.");
                return res.status(500).send('Erro de configuração');
            }

            const client = new MercadoPagoConfig({ accessToken: accessToken.trim() });
            const payment = new Payment(client);

            // Consulta os detalhes do pagamento no Mercado Pago
            const paymentData = await payment.get({ id: paymentId });

            // Mapeamento de status do Mercado Pago para o seu Sistema
            let statusFinal = 'PENDENTE';
            if (paymentData.status === 'approved') statusFinal = 'PAGO';
            if (paymentData.status === 'cancelled' || paymentData.status === 'rejected') statusFinal = 'CANCELADO';
            if (paymentData.status === 'in_process') statusFinal = 'EM ANALISE';

            // ✅ Atualiza no seu banco de dados usando o ID do Gateway
            const atualizado = await PedidoModel.updateStatusByGatewayId(String(paymentId), statusFinal);

            if (atualizado) {
                console.log(`✅ Status do pedido gateway ${paymentId} atualizado para: ${statusFinal}`);
            } else {
                console.warn(`⚠️ Notificação recebida, mas pedido ${paymentId} não encontrado no banco local.`);
            }

        } catch (error) {
            console.error("❌ Erro no processamento do webhook MP:", error.message);
            
            // Se o MP responder que o pagamento não existe (404), retornamos 404 para ele tentar de novo
            if (error.status === 404) {
                return res.status(404).send('Pagamento ainda não disponível para consulta');
            }
            return res.status(500).send('Erro interno');
        }
    }

    // Retorna 200 sempre que a notificação for recebida com sucesso
    return res.status(200).send('OK');
};

export const handleMercadoLivreNotification = async (req, res, next) => {
    try {
        const notification = req.body;
        console.log('--- WEBHOOK DO MERCADO LIVRE RECEBIDO ---', notification);

        if (notification.topic === 'orders_v2') {
            // Supondo que você tenha essa função getValidAccessToken para o ML
            const accessToken = await getValidAccessToken();
            
            const { data: orderData } = await axios.get(notification.resource, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });

            const pedidoExistente = await PedidoModel.findByGatewayId(String(orderData.id));

            if (!pedidoExistente) {
                let cliente = await UsuarioModel.findByEmail(orderData.buyer.email);
                if (!cliente) {
                    cliente = await UsuarioModel.create({
                        nome_completo: `${orderData.buyer.first_name} ${orderData.buyer.last_name}`,
                        email: orderData.buyer.email,
                        hash_senha: 'senha_padrao_mercado_livre_segura', 
                        isAdmin: false
                    });
                }
                
                const shippingAddress = orderData.shipping.receiver_address;
                const enderecoCriado = await EnderecoModel.create({
                    id_usuario: cliente.id_usuario,
                    cep: shippingAddress.zip_code,
                    logradouro: shippingAddress.street_name,
                    numero: shippingAddress.street_number,
                    complemento: shippingAddress.comment,
                    bairro: shippingAddress.neighborhood.name,
                    cidade: shippingAddress.city.name,
                    estado: shippingAddress.state.id.replace('BR-', ''),
                    is_principal: false
                });

                const itemsDoPedido = orderData.order_items.map(item => ({
                    produtos: { 
                        id_produto: null,
                        nome: item.item.title,
                        preco: item.unit_price,
                        imagem_url: item.item.picture_url || null
                    },
                    quantidade: item.quantity,
                }));
                
                const statusPagamento = orderData.payments[0]?.status === 'approved' ? 'PAGO' : 'PENDENTE';
                const statusEntrega = statusPagamento === 'PAGO' ? 'Em processamento' : 'Pendente';

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
                    canal_venda: 'Mercado Livre',
                }, itemsDoPedido);
                
                console.log(`✅ Pedido #${orderData.id} do Mercado Livre criado.`);
            }
        }
        
        res.status(200).send('Notificação recebida.');
    } catch (error) {
        console.error('❌ Erro ao processar webhook do Mercado Livre:', error.message);
        res.status(200).send('Erro logado, mas aviso recebido'); // Evita loop de erro no ML
    }
};