import { MercadoPagoConfig, Payment } from 'mercadopago';
import crypto from 'crypto';
import ConfiguracaoModel from '../models/configuracaoModel.js';

const getMercadoPagoClient = async () => {
    const accessToken = await ConfiguracaoModel.get('MERCADOPAGO_ACCESS_TOKEN');
    if (!accessToken) throw new Error('Access Token não configurado no banco.');
    return new MercadoPagoConfig({ accessToken: accessToken.trim() });
};

const getNotificationUrl = async () => {
    let backendUrl = await ConfiguracaoModel.get('BACKEND_URL');
    if (!backendUrl) return null;
    backendUrl = backendUrl.trim().replace(/\/$/, "");
    return `${backendUrl}/api/webhooks/mercadopago`;
};

/**
 * Cria um pagamento PIX com Itens Detalhados (Recomendação Antifraude)
 */
export const criarPagamentoPix = async (dados) => {
    try {
        const client = await getMercadoPagoClient();
        const payment = new Payment(client);
        const notification_url = await getNotificationUrl();
        
        const { payer, amount } = dados; 
        const idempotencyKey = crypto.randomUUID();

        // 1. Preparamos os dados básicos (sanitizados)
        const payerData = {
            email: payer.email.trim(),
            first_name: payer.firstName,
            last_name: payer.lastName || 'Sobrenome',
            identification: {
                type: payer.identification.type,
                number: String(payer.identification.number).replace(/\D/g, '') // Remove pontos/traços
            }
        };

        // 2. Definimos a data de expiração desejada (10 ou 30 min)
        const minutosParaExpirar = 30;
        const data = new Date();
        data.setMinutes(data.getMinutes() + minutosParaExpirar);
        const expiracaoISO = data.toISOString().split('.')[0] + "Z";

        const bodyComExpiracao = {
            transaction_amount: Number(parseFloat(amount).toFixed(2)),
            description: `Pedido de ${payer.firstName}`,
            payment_method_id: 'pix',
            date_of_expiration: expiracaoISO, // ✅ Tenta com expiração primeiro
            notification_url: notification_url,
            payer: payerData
        };

        try {
            // ✅ TENTATIVA 1: Com tempo de expiração
            console.log("🚀 Tentando criar PIX com expiração...");
            return await payment.create({ body: bodyComExpiracao, requestOptions: { idempotencyKey } });
        } catch (error) {
            // Se o erro for 23 (campo inválido), tentamos sem a expiração
            if (error.cause && error.cause.some(e => e.code === 23)) {
                console.warn("⚠️ Conta não aceita expiração customizada. Tentando sem data de expiração...");
                
                const bodySemExpiracao = { ...bodyComExpiracao };
                delete bodySemExpiracao.date_of_expiration; // 🚀 Remove a expiração para o MP escolher
                
                // Nova chave de idempotência para uma nova tentativa
                return await payment.create({ 
                    body: bodySemExpiracao, 
                    requestOptions: { idempotencyKey: crypto.randomUUID() } 
                });
            }
            throw error; // Se for outro erro, repassa
        }

    } catch (error) {
        console.error("❌ Erro MP PIX:", JSON.stringify(error.cause || error.message, null, 2));
        throw new Error("Falha ao gerar pagamento PIX.");
    }
};
/**
 * Cria um pagamento com Cartão de Crédito (Inclui Device ID e Itens)
 */
export const criarPagamentoCartao = async (dados) => {
    try {
        const client = await getMercadoPagoClient();
        const payment = new Payment(client);
        const notification_url = await getNotificationUrl();
        
        const { amount, token, payer, installments, payment_method_id, issuer_id, items, device_id } = dados;

        const body = {
            transaction_amount: Number(amount),
            token: token,
            description: 'Pagamento via Cartão de Crédito',
            installments: Number(installments),
            payment_method_id: payment_method_id,
            issuer_id: issuer_id,
            notification_url: notification_url,
            payer: {
                email: payer.email,
                identification: {
                    type: payer.identification.type,
                    number: payer.identification.number,
                },
            },
            // ✅ AÇÃO RECOMENDADA: Itens e Dados do Comprador
            additional_info: {
                items: items.map(item => ({
                    id: String(item.id),
                    title: item.title,
                    quantity: Number(item.quantity),
                    unit_price: Number(item.unit_price)
                })),
                payer: {
                    first_name: payer.firstName,
                    last_name: payer.lastName,
                }
            },
            // ✅ AÇÃO OBRIGATÓRIA: Identificador do Dispositivo
            metadata: {
                device_id: device_id 
            }
        };

        return await payment.create({ body, requestOptions: { idempotencyKey: crypto.randomUUID() } });
    } catch (error) {
        console.error("❌ Erro MP Cartão:", error.cause || error.message);
        throw new Error(error.cause?.details?.[0]?.description || 'Pagamento recusado.');
    }
};

/**
 * Cria um pagamento com Cartão de Débito
 */
export const criarPagamentoDebito = async (dados) => {
    try {
        const client = await getMercadoPagoClient();
        const payment = new Payment(client);
        const notification_url = await getNotificationUrl();
        
        const { amount, token, payer, payment_method_id, issuer_id, items } = dados;

        const body = {
            transaction_amount: Number(amount),
            token: token,
            description: 'Pagamento via Cartão de Débito',
            installments: 1, 
            payment_method_id: payment_method_id,
            issuer_id: issuer_id,
            notification_url: notification_url,
            payer: {
                email: payer.email,
                identification: {
                    type: payer.identification.type,
                    number: payer.identification.number,
                },
            },
            additional_info: {
                items: items.map(item => ({
                    id: String(item.id),
                    title: item.title,
                    quantity: Number(item.quantity),
                    unit_price: Number(item.unit_price)
                }))
            }
        };

        return await payment.create({ body, requestOptions: { idempotencyKey: crypto.randomUUID() } });

    } catch (error) {
        console.error("❌ Erro MP Débito:", error.cause || error.message);
        throw new Error(error.cause?.details?.[0]?.description || 'Pagamento recusado.');
    }
};