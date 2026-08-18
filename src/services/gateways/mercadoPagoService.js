import { MercadoPagoConfig, Payment } from 'mercadopago';
import crypto from 'crypto';
import ConfiguracaoModel from '../../models/configuracaoModel.js';

const getMercadoPagoClient = async (id_tenant) => {
    const accessToken = await ConfiguracaoModel.get('MERCADOPAGO_ACCESS_TOKEN', id_tenant);
    if (!accessToken) throw new Error('Access Token do Mercado Pago não configurado para esta loja.');
    return new MercadoPagoConfig({ accessToken: accessToken.trim() });
};

const getNotificationUrl = async (id_tenant) => {
    let backendUrl = await ConfiguracaoModel.get('BACKEND_URL', id_tenant);
    if (!backendUrl) return null;
    backendUrl = backendUrl.trim().replace(/\/$/, "");
    return `${backendUrl}/api/webhooks/mercadopago`;
};

// 🟢 FUNÇÃO AUXILIAR: Formata o endereço corretamente para o Mercado Pago não recusar por Antifraude
const formatAddressForMP = (rawAddr) => {
    if (!rawAddr) return undefined;

    const rawNumber = String(rawAddr.number || rawAddr.street_number || '');
    const cleanNumber = parseInt(rawNumber.replace(/\D/g, ''), 10);
    const finalNumber = (isNaN(cleanNumber) || cleanNumber === 0) ? 1 : cleanNumber;

    const finalZip = (rawAddr.zip || rawAddr.zip_code || '01001000').replace(/\D/g, '');

    let finalState = rawAddr.state || rawAddr.federal_unit || 'SP';
    if (finalState.length > 2) finalState = finalState.substring(0, 2); 

    return {
        zip_code: finalZip,
        street_name: rawAddr.street || rawAddr.street_name || 'Rua não informada',
        street_number: finalNumber, 
        neighborhood: rawAddr.neighborhood || rawAddr.bairro || 'Centro',
        city: rawAddr.city || 'Cidade',
        federal_unit: finalState.toUpperCase()
    };
};

export const criarPagamentoPix = async (dados, id_tenant) => {
    try {
        const client = await getMercadoPagoClient(id_tenant);
        const payment = new Payment(client);
        const notification_url = await getNotificationUrl(id_tenant);
        
        const { payer, amount } = dados; 
        const idempotencyKey = crypto.randomUUID();

        const payerData = {
            email: payer.email.trim(),
            first_name: payer.firstName,
            last_name: payer.lastName || 'Sobrenome',
            identification: {
                type: payer.identification.type || 'CPF',
                number: String(payer.identification.number).replace(/\D/g, '')
            }
        };

        const minutosParaExpirar = 30;
        const data = new Date();
        data.setMinutes(data.getMinutes() + minutosParaExpirar);
        const expiracaoISO = data.toISOString().split('.')[0] + "Z";

        const body = {
            transaction_amount: Number(parseFloat(amount).toFixed(2)),
            description: `Pedido de ${payer.firstName}`,
            payment_method_id: 'pix',
            date_of_expiration: expiracaoISO,
            notification_url: notification_url,
            payer: payerData,
            metadata: { device_id: dados.device_id, tenant_id: id_tenant }
        };

        try {
            console.log("🚀 MP Service: Criando PIX...");
            return await payment.create({ body, requestOptions: { idempotencyKey } });
        } catch (error) {
            if (error.cause && error.cause.some(e => e.code === 23)) {
                console.warn("⚠️ MP: Tentando sem data de expiração...");
                delete body.date_of_expiration;
                return await payment.create({ body, requestOptions: { idempotencyKey: crypto.randomUUID() } });
            }
            throw error;
        }

    } catch (error) {
        console.error("❌ Erro MP PIX:", JSON.stringify(error.cause || error.message, null, 2));
        throw new Error("Falha ao gerar pagamento PIX.");
    }
};

export const criarPagamentoCartao = async (dados, id_tenant) => {
    console.log("🚀 MP Service: Iniciando Cartão de Crédito...");
    try {
        const client = await getMercadoPagoClient(id_tenant);
        const payment = new Payment(client);
        const notification_url = await getNotificationUrl(id_tenant);
        
        const { amount, token, payer, installments, payment_method_id, issuer_id, items, device_id, orderId } = dados;

        const body = {
            transaction_amount: Number(amount),
            token: token,
            description: items?.[0]?.description || 'Pagamento via Cartão de Crédito', 
            external_reference: orderId,
            statement_descriptor: 'ARARINHA SAAS',
            installments: Number(installments),
            payment_method_id: payment_method_id,
            issuer_id: issuer_id,
            notification_url: notification_url,
            payer: {
                email: payer.email,
                identification: {
                    type: payer.identification.type || 'CPF',
                    number: String(payer.identification.number).replace(/\D/g, ''),
                },
                first_name: payer.firstName,
                last_name: payer.lastName,
                // 🟢 AÇÃO 4: O Endereço formatado é obrigatório para passar no Antifraude!
                address: formatAddressForMP(payer.address)
            },
            additional_info: {
                items: items?.map(item => ({
                    id: String(item.id),
                    title: item.title,
                    description: item.description || 'Produto da loja', 
                    category_id: item.category_id || 'others',
                    quantity: Number(item.quantity),
                    unit_price: Number(item.unit_price)
                })),
                payer: {
                    first_name: payer.firstName,
                    last_name: payer.lastName,
                },
                // 🟢 AÇÃO 5: O MP exige um IP válido para antifraude do cartão
                ip_address: '127.0.0.1' 
            },
            metadata: {
                device_id: device_id,
                tenant_id: id_tenant
            }
        };

        const response = await payment.create({ body, requestOptions: { idempotencyKey: crypto.randomUUID() } });
        return response;

    } catch (error) {
        console.error("❌ Erro MP Cartão:", JSON.stringify(error.cause || error.message, null, 2));
        throw new Error(error.cause?.details?.[0]?.description || 'Pagamento com cartão recusado.');
    }
};

export const criarPagamentoDebito = async (dados, id_tenant) => {
    console.log("🚀 MP Service: Iniciando Cartão de Débito...");
    try {
        const client = await getMercadoPagoClient(id_tenant);
        const payment = new Payment(client);
        const notification_url = await getNotificationUrl(id_tenant);
        
        const { amount, token, payer, payment_method_id, issuer_id, items, device_id, orderId } = dados;

        if (!payment_method_id) {
             throw new Error("O identificador do método de pagamento (payment_method_id) é obrigatório para transações de débito.");
        }

        const body = {
            transaction_amount: Number(amount),
            token: token,
            description: items?.[0]?.description || 'Pagamento via Cartão de Débito',
            external_reference: orderId, 
            statement_descriptor: 'ARARINHA SAAS',
            installments: 1,
            payment_method_id: payment_method_id,
            issuer_id: issuer_id,
            notification_url: notification_url,
            payer: {
                email: payer.email,
                identification: {
                    type: payer.identification?.type || 'CPF',
                    number: String(payer.identification?.number || '').replace(/\D/g, ''),
                },
                first_name: payer.firstName,
                last_name: payer.lastName,
                // 🟢 AÇÃO 4: O Endereço formatado é obrigatório para passar no Antifraude!
                address: formatAddressForMP(payer.address)
            },
            additional_info: {
                items: items?.map(item => ({
                    id: String(item.id),
                    title: item.title,
                    description: item.description || 'Produto da loja',
                    category_id: item.category_id || 'others',
                    quantity: Number(item.quantity),
                    unit_price: Number(item.unit_price)
                })),
                // 🟢 AÇÃO 5: O MP exige um IP válido para antifraude
                ip_address: '127.0.0.1' 
            },
            metadata: {
                device_id: device_id,
                tenant_id: id_tenant
            }
        };

        const response = await payment.create({ body, requestOptions: { idempotencyKey: crypto.randomUUID() } });
        return response;

    } catch (error) {
        console.error("❌ Erro MP Débito:", JSON.stringify(error.cause || error.message, null, 2));
        const errorDesc = error.cause?.details?.[0]?.description || error.message;
        throw new Error(errorDesc || 'Pagamento com débito recusado.');
    }
};

export const criarPagamentoBoleto = async (dados, id_tenant) => {
    console.log("🚀 MP Service: Iniciando Boleto...");
    try {
        const client = await getMercadoPagoClient(id_tenant);
        const payment = new Payment(client);
        const notification_url = await getNotificationUrl(id_tenant);
        
        const { amount, payer, description, items, device_id } = dados;

        const payerAddress = formatAddressForMP(payer.address);

        console.log("📦 Payload Endereço MP:", payerAddress); 

        const body = {
            transaction_amount: Number(amount),
            description: description || 'Pagamento via Boleto',
            payment_method_id: 'bolbradesco', 
            notification_url: notification_url,
            payer: {
                email: payer.email,
                first_name: payer.firstName,
                last_name: payer.lastName || 'Cliente',
                identification: {
                    type: payer.identification.type || 'CPF',
                    number: String(payer.identification.number).replace(/\D/g, '')
                },
                address: payerAddress 
            },
            additional_info: {
                items: items?.map(item => ({
                    id: String(item.id),
                    title: item.title,
                    quantity: Number(item.quantity),
                    unit_price: Number(item.unit_price)
                })),
                ip_address: '127.0.0.1' 
            },
            metadata: {
                device_id: device_id,
                tenant_id: id_tenant
            }
        };

        const response = await payment.create({ body, requestOptions: { idempotencyKey: crypto.randomUUID() } });
        return response;

    } catch (error) {
        console.error("❌ Erro MP Boleto Payload:", JSON.stringify(error.cause || error.message, null, 2));
        throw new Error("Falha ao gerar Boleto no Mercado Pago.");
    }
};

export const criarPagamentoCarteira = async (dados, id_tenant) => {
    console.log("🚀 MP Service: Iniciando Pagamento via Carteira...");
    try {
        const client = await getMercadoPagoClient(id_tenant);
        const payment = new Payment(client);
        const notification_url = await getNotificationUrl(id_tenant);
        
        const { amount, token, payer, description, device_id } = dados;

        const body = {
            transaction_amount: Number(amount),
            description: description || 'Pagamento via Saldo Mercado Pago',
            payment_method_id: 'account_money',
            token: token, 
            notification_url: notification_url,
            payer: {
                email: payer.email,
                identification: {
                    type: payer.identification.type || 'CPF',
                    number: String(payer.identification.number).replace(/\D/g, '')
                }
            },
            metadata: {
                device_id: device_id,
                tenant_id: id_tenant
            }
        };

        const response = await payment.create({ body, requestOptions: { idempotencyKey: crypto.randomUUID() } });
        return response;

    } catch (error) {
        console.error("❌ Erro MP Carteira:", JSON.stringify(error.cause || error.message, null, 2));
        throw new Error("Falha ao processar pagamento via Carteira Mercado Pago.");
    }
};