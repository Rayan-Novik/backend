import axios from 'axios';
import ConfiguracaoModel from '../../models/configuracaoModel.js';

const getAsaasConfig = async (id_tenant) => {
    const apiKey = await ConfiguracaoModel.get('ASAAS_API_KEY', id_tenant);
    
    if (!apiKey) throw new Error('API Key do Asaas não configurada para esta loja.');

    const isSandboxKey = apiKey.includes('hmlg') || apiKey.includes('sandbox');
    const baseUrl = isSandboxKey 
        ? 'https://sandbox.asaas.com/api/v3' 
        : 'https://www.asaas.com/api/v3';

    return {
        baseUrl,
        options: {
            headers: {
                'access_token': apiKey,
                'Content-Type': 'application/json'
            }
        }
    };
};

const getOrCreateCustomer = async (payer, id_tenant) => {
    const { baseUrl, options } = await getAsaasConfig(id_tenant);
    
    const cpfCnpj = payer.identification.number.replace(/\D/g, '');
    
    try {
        const { data: search } = await axios.get(`${baseUrl}/customers?cpfCnpj=${cpfCnpj}`, options);
        
        if (search.data && search.data.length > 0) {
            return search.data[0].id;
        }

        const { data: newCustomer } = await axios.post(`${baseUrl}/customers`, {
            name: `${payer.firstName} ${payer.lastName}`,
            email: payer.email,
            cpfCnpj: cpfCnpj,
            phone: payer.phone, 
            mobilePhone: payer.phone
        }, options);

        return newCustomer.id;
    } catch (error) {
        console.error("Erro ao buscar/criar cliente Asaas:", error.response?.data || error.message);
        throw error;
    }
};

export const criarPixAsaas = async (dados, id_tenant) => {
    const { baseUrl, options } = await getAsaasConfig(id_tenant);
    const customerId = await getOrCreateCustomer(dados.payer, id_tenant);

    const payload = {
        customer: customerId,
        billingType: 'PIX',
        value: dados.amount,
        dueDate: new Date().toISOString().split('T')[0], 
        description: `Pedido #${dados.orderId}`,
        externalReference: dados.orderId
    };

    try {
        const { data } = await axios.post(`${baseUrl}/payments`, payload, options);
        
        const { data: qrData } = await axios.get(`${baseUrl}/payments/${data.id}/pixQrCode`, options);

        const dataExpiracaoCorrigida = `${data.dueDate}T23:59:59`;

        return {
            id: data.id,
            status: 'pending',
            gateway: 'ASAAS',
            pix_data: {
                qr_code: qrData.payload, 
                qr_code_base64: qrData.encodedImage, 
                expiration: dataExpiracaoCorrigida 
            },
            original_response: data
        };
    } catch (error) {
        console.error("Erro Asaas Pix:", error.response?.data || error.message);
        throw new Error(error.response?.data?.errors[0]?.description || "Erro ao criar PIX Asaas");
    }
};

export const criarBoletoAsaas = async (dados, id_tenant) => {
    const { baseUrl, options } = await getAsaasConfig(id_tenant);
    const customerId = await getOrCreateCustomer(dados.payer, id_tenant);

    const payload = {
        customer: customerId,
        billingType: 'BOLETO',
        value: dados.amount,
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], 
        description: `Pedido #${dados.orderId}`,
        externalReference: dados.orderId
    };

    try {
        const { data } = await axios.post(`${baseUrl}/payments`, payload, options);
        
        let linhaDigitavel = data.identificationField;
        let codigoBarras = data.barCode || data.identificationField;

        if (!linhaDigitavel) {
            try {
                const { data: identData } = await axios.get(`${baseUrl}/payments/${data.id}/identificationField`, options);
                linhaDigitavel = identData.identificationField;
                codigoBarras = identData.barCode;
            } catch (err) {
                console.warn("⚠️ Falha ao buscar linha digitável extra:", err.message);
            }
        }

        return {
            id: data.id,
            status: 'pending',
            gateway: 'ASAAS',
            boleto_data: {
                barcode: codigoBarras, 
                digitable_line: linhaDigitavel 
            },
            linha_digitavel: linhaDigitavel,
            barcode: codigoBarras,
            identificationField: linhaDigitavel, 
            url_pdf: data.bankSlipUrl,
            original_response: data
        };
    } catch (error) {
        console.error("Erro Asaas Boleto:", error.response?.data || error.message);
        throw new Error("Erro ao criar Boleto Asaas");
    }
};

export const criarCartaoAsaas = async (dados, id_tenant) => {
    const { baseUrl, options } = await getAsaasConfig(id_tenant);
    const customerId = await getOrCreateCustomer(dados.payer, id_tenant);

    const creditCardHolderInfo = {
        name: dados.card.holderName,
        email: dados.payer.email,
        cpfCnpj: dados.payer.identification.number,
        postalCode: dados.payer.address.zip_code,
        addressNumber: dados.payer.address.street_number || '0',
        phone: '4738010919'
    };

    const payload = {
        customer: customerId,
        billingType: 'CREDIT_CARD',
        value: dados.amount,
        dueDate: new Date().toISOString().split('T')[0],
        description: `Pedido #${dados.orderId}`,
        externalReference: dados.orderId,
        creditCard: {
            holderName: dados.card.holderName,
            number: dados.card.number,
            expiryMonth: dados.card.expiryMonth,
            expiryYear: dados.card.expiryYear,
            ccv: dados.card.ccv
        },
        creditCardHolderInfo: creditCardHolderInfo
    };

    try {
        const { data } = await axios.post(`${baseUrl}/payments`, payload, options);
        
        return {
            id: data.id,
            status: data.status === 'CONFIRMED' ? 'approved' : 'pending',
            gateway: 'ASAAS',
            original_response: data
        };
    } catch (error) {
        console.error("Erro Asaas Cartão:", error.response?.data || error.message);
        throw new Error(error.response?.data?.errors[0]?.description || "Erro no Cartão Asaas");
    }
};