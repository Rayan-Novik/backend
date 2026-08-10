import axios from 'axios';
import ConfiguracaoModel from '../../models/configuracaoModel.js';

const BASE_URL = 'https://api.abacatepay.com/v1';

const getHeaders = async (id_tenant) => {
    const apiKey = await ConfiguracaoModel.get('ABACATEPAY_API_KEY', id_tenant);
    if (!apiKey) throw new Error('API Key do AbacatePay não configurada para esta loja.');
    return {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        }
    };
};

const getOrCreateCustomer = async (payer, config) => {
    const email = payer.email || 'cliente@loja.com';
    
    try {
        const { data: listData } = await axios.get(`${BASE_URL}/customer/list`, config);
        
        if (listData && Array.isArray(listData.data)) {
            const existing = listData.data.find(c => c.email === email);
            if (existing?.id) return existing.id;
        }

        const payloadCliente = {
            name: `${payer.firstName} ${payer.lastName}`.trim(),
            email: email,
            taxId: payer.identification?.number?.replace(/\D/g, '') || '',
            cellphone: payer.phone?.replace(/\D/g, '') || ''
        };

        const { data: createData } = await axios.post(`${BASE_URL}/customer/create`, payloadCliente, config);
        
        return createData?.data?.id || null;

    } catch (error) {
        console.warn("⚠️ AbacatePay: Falha ao gerenciar cliente (usando fallback inline)...", error.message);
        return null; 
    }
};

export const criarCobrancaAbacate = async (dados, methods = ["PIX"], id_tenant) => {
    const config = await getHeaders(id_tenant);
    const amountInCents = Math.round(Number(dados.amount) * 100);
    const returnUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/order/${dados.orderId}`;

    try {
        const customerId = await getOrCreateCustomer(dados.payer, config);

        const payload = {
            frequency: "ONE_TIME",
            methods: methods,
            products: [{
                externalId: dados.orderId,
                name: `Pedido #${dados.orderId}`,
                quantity: 1,
                price: amountInCents,
                description: dados.description || "Compra PDV"
            }],
            returnUrl: returnUrl,
            completionUrl: returnUrl
        };

        if (customerId) {
            payload.customerId = customerId;
        } else {
            payload.customer = {
                name: `${dados.payer.firstName} ${dados.payer.lastName}`,
                email: dados.payer.email,
                taxId: dados.payer.identification.number.replace(/\D/g, ''),
                cellphone: dados.payer.phone?.replace(/\D/g, '') || ''
            };
        }

        const { data } = await axios.post(`${BASE_URL}/billing/create`, payload, config);

        if (!data || !data.data || !data.data.id) {
            throw new Error("AbacatePay respondeu, mas não retornou ID da cobrança.");
        }

        return {
            id: data.data.id,
            status: 'pending',
            gateway: 'ABACATEPAY',
            payment_url: data.data.url, 
            pix_data: {
                qr_code: data.data.payment?.pix?.code || data.data.pix?.code, 
                qr_code_base64: null, 
                qr_code_url: data.data.url, 
                expiration: null
            },
            original_response: data
        };

    } catch (error) {
        console.error("Erro AbacatePay Billing:", error.response?.data || error.message);
        throw new Error("Erro ao criar cobrança no AbacatePay.");
    }
};