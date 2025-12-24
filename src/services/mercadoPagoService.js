import { MercadoPagoConfig, Payment } from 'mercadopago';
import crypto from 'crypto';
// ✅ 1. Importa o seu model de configurações para buscar dados do banco
import ConfiguracaoModel from '../models/configuracaoModel.js';

/**
 * ✅ 2. NOVA FUNÇÃO AUXILIAR
 * Busca o Access Token do banco de dados e cria um cliente do Mercado Pago configurado.
 * Esta função centraliza a lógica de obter a credencial.
 * @returns {Promise<MercadoPagoConfig>}
 */
const getMercadoPagoClient = async () => {
    // Busca o token do banco de dados em vez do process.env
    const accessToken = await ConfiguracaoModel.get('MERCADOPAGO_ACCESS_TOKEN');
    
    if (!accessToken) {
        throw new Error('Access Token do Mercado Pago não configurado no painel de administração.');
    }
    
    return new MercadoPagoConfig({ accessToken });
};

/**
 * Cria um pagamento PIX no Mercado Pago.
 */
export const criarPagamentoPix = async (dados) => {
    try {
        // ✅ 3. ATUALIZADO: Usa a função auxiliar para obter o cliente configurado
        const client = await getMercadoPagoClient();
        const payment = new Payment(client);
        
        const { payer, amount } = dados;
        const notification_url = `${process.env.BACKEND_URL}/api/webhooks/mercadopago`;
        const idempotencyKey = crypto.randomUUID();

        const body = {
            transaction_amount: Number(amount),
            description: `Pedido de ${payer.firstName} ${payer.lastName}`,
            payment_method_id: 'pix',
            payer: {
                email: payer.email,
                first_name: payer.firstName,
                last_name: payer.lastName,
                identification: {
                    type: payer.identification.type,
                    number: payer.identification.number
                }
            },
            notification_url: notification_url,
        };

        const result = await payment.create({ 
            body,
            requestOptions: {
                idempotencyKey: idempotencyKey
            }
        });
        return result;

    } catch (error) {
        console.error("Erro ao criar pagamento PIX:", error.cause || error.message);
        throw new Error("Falha ao gerar pagamento PIX no Mercado Pago.");
    }
};

/**
 * Cria um pagamento com Cartão de Crédito usando um token seguro.
 */
export const criarPagamentoCartao = async (dados) => {
    try {
        // ✅ 4. ATUALIZADO: Também usa a função auxiliar aqui
        const client = await getMercadoPagoClient();
        const payment = new Payment(client);
        
        const { amount, token, payer, installments, payment_method_id, issuer_id } = dados;
        const idempotencyKey = crypto.randomUUID();
        const notification_url = `${process.env.BACKEND_URL}/api/webhooks/mercadopago`;

        const result = await payment.create({
            body: {
                transaction_amount: Number(amount),
                token: token,
                description: 'Pagamento do pedido via Cartão',
                installments: Number(installments),
                payment_method_id: payment_method_id,
                issuer_id: issuer_id,
                payer: {
                    email: payer.email,
                    identification: {
                        type: payer.identification.type,
                        number: payer.identification.number,
                    },
                },
                notification_url: notification_url,
            },
            requestOptions: {
                idempotencyKey: idempotencyKey,
            }
        });
        return result;
    } catch (error) {
        console.error("Erro ao criar pagamento com cartão:", error.cause);
        throw new Error(error.cause?.details?.[0]?.description || 'Pagamento com cartão foi recusado.');
    }
};

export const criarPagamentoDebito = async (dados) => {
    try {
        // 1. Reutiliza sua função auxiliar para pegar o cliente
        const client = await getMercadoPagoClient();
        const payment = new Payment(client);
        
        // 2. Pega os dados. Note que 'installments' não vem, pois será fixo.
        const { amount, token, payer, payment_method_id, issuer_id } = dados;
        const idempotencyKey = crypto.randomUUID();
        const notification_url = `${process.env.BACKEND_URL}/api/webhooks/mercadopago`;

        const result = await payment.create({
            body: {
                transaction_amount: Number(amount),
                token: token,
                description: 'Pagamento do pedido via Cartão de Débito', // Descrição atualizada
                installments: 1, // ✅ ESSENCIAL: Débito é sempre 1 parcela
                payment_method_id: payment_method_id,
                issuer_id: issuer_id,
                payer: {
                    email: payer.email,
                    identification: {
                        type: payer.identification.type,
                        number: payer.identification.number,
                    },
                },
                notification_url: notification_url,
            },
            requestOptions: {
                idempotencyKey: idempotencyKey,
            }
        });
        return result;

    } catch (error) {
        // 3. Mensagem de erro específica para débito
        console.error("Erro ao criar pagamento com débito:", error.cause);
        throw new Error(error.cause?.details?.[0]?.description || 'Pagamento com débito foi recusado.');
    }
};
