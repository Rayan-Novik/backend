import axios from 'axios';
import ConfiguracaoModel from '../../models/configuracaoModel.js';

const normalizarPagador = (dados) => {
    const pagador = dados.pagador || dados.payer || {};
    
    const nome = pagador.nome || pagador.name || pagador.first_name || 'Cliente Consumidor';
    
    let cpf = pagador.cpf || pagador.identification?.number || pagador.docNumber || '00000000000';
    cpf = cpf.replace(/\D/g, ''); 

    const email = pagador.email || 'email@naoinformado.com';

    return { nome, cpf, email };
};

const gerarMerchantOrderId = (dados) => {
    const id = dados.id_interno || dados.orderId || dados.id || dados.ref;
    if (id) return String(id);
    return `PED-${Date.now()}`;
};

const getCieloConfig = async (id_tenant) => {
    const merchantId = await ConfiguracaoModel.get('CIELO_MERCHANT_ID', id_tenant);
    const merchantKey = await ConfiguracaoModel.get('CIELO_MERCHANT_KEY', id_tenant);
    const isSandbox = (await ConfiguracaoModel.get('CIELO_SANDBOX', id_tenant)) === 'true';

    if (!merchantId || !merchantKey) {
        throw new Error('Credenciais da Cielo (MerchantId/Key) não configuradas para esta loja.');
    }

    return {
        headers: {
            'Content-Type': 'application/json',
            // Aplicando o trim() para garantir que não há espaços perdidos
            'MerchantId': merchantId.trim(),
            'MerchantKey': merchantKey.trim() 
        },
        baseUrl: isSandbox 
            ? 'https://apisandbox.cieloecommerce.cielo.com.br/1/sales/' 
            : 'https://api.cieloecommerce.cielo.com.br/1/sales/',
        isSandbox
    };
};

export const criarPagamentoCartaoCielo = async (dados, tipo = 'CreditCard', id_tenant) => {
    const { headers, baseUrl } = await getCieloConfig(id_tenant);
    const cliente = normalizarPagador(dados); 
    const amountInCents = Math.round(dados.valor * 100);
    const cardData = dados.card || {};
    const orderId = gerarMerchantOrderId(dados);

    const payload = {
        MerchantOrderId: orderId, 
        Customer: {
            Name: cliente.nome,
            Identity: cliente.cpf,
            Email: cliente.email
        },
        Payment: {
            Type: tipo,
            Amount: amountInCents,
            Installments: dados.parcelas || 1,
            Capture: true, 
            CreditCard: {
                CardNumber: (cardData.numero || dados.token || '').replace(/\s/g, ''),
                Holder: cardData.nome_titular || cliente.nome,
                ExpirationDate: cardData.validade || '12/2030', 
                SecurityCode: cardData.cvv || '123',
                Brand: cardData.bandeira || 'Visa' 
            }
        }
    };

    try {
        const { data } = await axios.post(baseUrl, payload, { headers });
        const isApproved = data.Payment.Status === 1 || data.Payment.Status === 2;

        return {
            id: data.Payment.PaymentId,
            status: isApproved ? 'approved' : 'pending',
            original_response: data
        };
    } catch (error) {
        console.error('Erro Cielo Cartão:', error.response?.data || error.message);
        const msgErro = error.response?.data?.[0]?.Message || 'Erro ao processar cartão na Cielo.';
        throw new Error(msgErro);
    }
};

export const criarPagamentoPixCielo = async (dados, id_tenant) => {
    const { headers, baseUrl } = await getCieloConfig(id_tenant);
    const cliente = normalizarPagador(dados);
    const amountInCents = Math.round(dados.valor * 100);
    const orderId = gerarMerchantOrderId(dados);

    const payload = {
        MerchantOrderId: orderId,
        Customer: { 
            Name: cliente.nome, 
            Identity: cliente.cpf 
        },
        Payment: {
            Type: 'Pix',
            Amount: amountInCents
        }
    };

    try {
        const { data } = await axios.post(baseUrl, payload, { headers });
        return {
            id: data.Payment.PaymentId,
            status: 'pending',
            pix_data: {
                qr_code: data.Payment.QrCodeString,
                qr_code_base64: data.Payment.QrCodeBase64Image,
                qr_code_url: data.Payment.QrCodeUrl
            },
            original_response: data
        };
    } catch (error) {
        console.error('Erro Cielo Pix:', error.response?.data || error.message);
        throw new Error('Erro ao gerar Pix na Cielo.');
    }
};

export const criarPagamentoBoletoCielo = async (dados, id_tenant) => {
    const { headers, baseUrl } = await getCieloConfig(id_tenant);
    const cliente = normalizarPagador(dados);
    const amountInCents = Math.round(dados.valor * 100);
    const orderId = gerarMerchantOrderId(dados);

    const providerConfig = await ConfiguracaoModel.get('CIELO_BOLETO_PROVIDER', id_tenant);
    const providerBoleto = providerConfig || 'Bradesco2'; 

    const end = dados.endereco || dados.payer?.address || {};
    
    const payload = {
        MerchantOrderId: orderId,
        Customer: { 
            Name: cliente.nome, 
            Identity: cliente.cpf,
            Address: { 
                Street: end.rua || end.street || 'Rua Geral',
                Number: end.numero || end.number || '100',
                Complement: end.complemento || '',
                ZipCode: (end.cep || end.zip || '00000000').replace(/\D/g, ''),
                District: end.bairro || end.neighborhood || 'Centro', 
                City: end.cidade || end.city || 'Sao Paulo',
                State: end.estado || end.state || 'SP',
                Country: 'BRA'
            }
        },
        Payment: {
            Type: 'Boleto',
            Amount: amountInCents,
            Provider: providerBoleto, 
            BoletoNumber: orderId.replace(/\D/g, '').slice(0, 10) || '12345', 
            Instructions: 'Não receber após o vencimento',
            ExpirationDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            Assignor: 'Loja Online',
            Demonstrative: 'Compra Online'
        }
    };

    try {
        const { data } = await axios.post(baseUrl, payload, { headers });
        return {
            id: data.Payment.PaymentId,
            status: 'pending',
            gateway: 'CIELO',
            payment_method: 'BOLETO',
            boleto_data: {
                url_boleto: data.Payment.Url,
                linha_digitavel: data.Payment.DigitableLine,
                expiration: data.Payment.ExpirationDate
            },
            original_response: data
        };
    } catch (error) {
        console.error('Erro Cielo Boleto:', JSON.stringify(error.response?.data, null, 2));
        const msg = error.response?.data?.[0]?.Message || 'Erro ao gerar Boleto na Cielo.';
        throw new Error(msg);
    }
};

export const criarPagamentoQrCodeCielo = async (dados, id_tenant) => {
    const { headers, baseUrl } = await getCieloConfig(id_tenant);
    const cliente = normalizarPagador(dados);
    const amountInCents = Math.round(dados.valor * 100);
    const orderId = gerarMerchantOrderId(dados);

    const payload = {
        MerchantOrderId: orderId,
        Customer: { Name: cliente.nome },
        Payment: {
            Type: 'QrCode',
            Amount: amountInCents
        }
    };

    try {
        const { data } = await axios.post(baseUrl, payload, { headers });
        return {
            id: data.Payment.PaymentId,
            status: 'pending',
            gateway: 'CIELO',
            payment_method: 'WALLET',
            pix_data: {
                qr_code_base64: data.Payment.QrCodeBase64Image,
                qr_code_url: data.Payment.QrCodeUrl 
            },
            original_response: data
        };
    } catch (error) {
        console.error('Erro Cielo QR Code:', error.response?.data || error.message);
        throw new Error('Erro ao gerar QR Code Cielo.');
    }
};