import Stripe from 'stripe';
import ConfiguracaoModel from '../../models/configuracaoModel.js';

const getClient = async (id_tenant) => {
    const key = await ConfiguracaoModel.get('STRIPE_SECRET_KEY', id_tenant) || process.env.STRIPE_SECRET_KEY;
    
    if (!key) {
        throw new Error('Stripe Secret Key não configurada para esta loja.');
    }
    return new Stripe(key);
};

export const criarPagamentoStripe = async (dados, id_tenant) => {
    const stripe = await getClient(id_tenant);
    const { amount, token, description, payer } = dados; 

    try {
        const amountInCents = Math.round(Number(amount) * 100);

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountInCents,
            currency: 'brl',
            payment_method: token, 
            confirm: true, 
            description: description,
            receipt_email: payer.email,
            return_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/status`, 
            automatic_payment_methods: {
                enabled: true,
                allow_redirects: 'never'
            },
            metadata: {
                tenant_id: id_tenant
            }
        });

        return {
            id: paymentIntent.id,
            status: paymentIntent.status === 'succeeded' ? 'approved' : 'pending',
            gateway: 'STRIPE',
            original_response: paymentIntent
        };
    } catch (error) {
        console.error("Erro Stripe Cartão:", error);
        throw new Error(error.raw?.message || error.message);
    }
};

export const criarPagamentoPixStripe = async (dados, id_tenant) => {
    const stripe = await getClient(id_tenant);
    const { amount, description, payer } = dados;

    try {
        const amountInCents = Math.round(Number(amount) * 100);

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountInCents,
            currency: 'brl',
            payment_method_types: ['pix'],
            payment_method_data: {
                type: 'pix',
                billing_details: {
                    email: payer.email,
                    name: payer.firstName ? `${payer.firstName} ${payer.lastName}` : payer.email,
                    address: { country: 'BR' } 
                }
            },
            description: description,
            receipt_email: payer.email,
            metadata: {
                integration_check: 'accept_a_payment',
                tenant_id: id_tenant
            },
        });

        const nextAction = paymentIntent.next_action;
        const pixData = nextAction?.pix_display_qr_code;

        if (!pixData) {
            throw new Error("Stripe não retornou dados do QR Code. Verifique se sua conta aceita BRL/Pix.");
        }

        return {
            id: paymentIntent.id,
            status: 'pending',
            gateway: 'STRIPE',
            pix_data: {
                qr_code: pixData.data, 
                qr_code_base64: null,  
                qr_code_url: pixData.image_url_png, 
                expiration: pixData.expires_at 
            },
            original_response: paymentIntent
        };
    } catch (error) {
        console.error("Erro Stripe Pix:", error);
        throw new Error(error.raw?.message || error.message);
    }
};

export const criarPagamentoBoletoStripe = async (dados, id_tenant) => {
    const stripe = await getClient(id_tenant);
    const { amount, description, payer } = dados;

    try {
        const amountInCents = Math.round(Number(amount) * 100);
        const address = payer.address || {};

        const cpfLimpo = (payer.cpf || payer.tax_id || '').replace(/\D/g, '');
        const cepLimpo = (address.zip || address.zip_code || '00000000').replace(/\D/g, '');

        const line1 = address.street || address.street_name 
            ? `${address.street || address.street_name}, ${address.number || address.street_number || 'S/N'}` 
            : 'Rua Principal, 100'; 

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountInCents,
            currency: 'brl',
            confirm: true,
            payment_method_types: ['boleto'],
            payment_method_data: {
                type: 'boleto',
                billing_details: {
                    name: payer.firstName ? `${payer.firstName} ${payer.lastName}` : 'Cliente',
                    email: payer.email,
                    address: {
                        country: 'BR',
                        line1: line1,
                        city: address.city || 'São Paulo',
                        state: address.state || 'SP',
                        postal_code: cepLimpo,
                    },
                },
                boleto: {
                    tax_id: cpfLimpo || '00000000000'
                }
            },
            payment_method_options: {
                boleto: {
                    expires_after_days: 3,
                },
            },
            return_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/payment/status`,
            description: description,
            receipt_email: payer.email,
            metadata: {
                tenant_id: id_tenant
            }
        });

        console.log(">>> STRIPE DEBUG RESPONSE:", JSON.stringify({
            status: paymentIntent.status,
            next_action: paymentIntent.next_action
        }, null, 2));

        const nextAction = paymentIntent.next_action;
        const boletoData = nextAction?.boleto_display_details;

        if (!boletoData) {
            throw new Error(`Stripe não gerou boleto. Status: ${paymentIntent.status}`);
        }

        return {
            id: paymentIntent.id,
            status: 'pending',
            gateway: 'STRIPE',
            payment_method: 'BOLETO',
            boleto_data: {
                url_boleto: boletoData.hosted_voucher_url,
                linha_digitavel: boletoData.number,
                expiration: boletoData.expires_at
            },
            original_response: paymentIntent
        };

    } catch (error) {
        console.error("Erro Stripe Boleto:", error);
        throw new Error(error.raw?.message || error.message);
    }
};