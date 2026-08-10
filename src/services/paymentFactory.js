import { 
    criarPagamentoCartao as mpCartao, 
    criarPagamentoDebito as mpDebito, 
    criarPagamentoPix as mpPix,
    criarPagamentoBoleto as mpBoleto,
    criarPagamentoCarteira as mpCarteira
} from './gateways/mercadoPagoService.js';   

import { 
    criarPagamentoStripe, 
    criarPagamentoPixStripe,
    criarPagamentoBoletoStripe 
} from './gateways/stripeService.js';

import { 
    criarPixAsaas, 
    criarBoletoAsaas, 
    criarCartaoAsaas 
} from './gateways/asaasService.js';

import { 
    criarPagamentoCartaoCielo, 
    criarPagamentoPixCielo, 
    criarPagamentoBoletoCielo,
    criarPagamentoQrCodeCielo 
} from './gateways/cieloService.js';

import { criarCobrancaAbacate } from './gateways/abacatePayService.js';

import GatewayRuleModel from '../models/GatewayRuleModel.js';

const formatResponse = (originalRes, gatewayName, normalizedStatus, pixData = null, customId = null) => {
    
    // 🟢 Tentativa de capturar a taxa real (fee/tax) dependendo do Gateway
    let feeAmount = null; 

    if (originalRes) {
        if (gatewayName === 'MERCADOPAGO') {
            // Mercado Pago envia a taxa dentro do array 'fee_details'
            if (originalRes.fee_details && Array.isArray(originalRes.fee_details)) {
                feeAmount = originalRes.fee_details.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
            }
        } 
        else if (gatewayName === 'ASAAS') {
            // Asaas envia o 'value' (Bruto) e o 'netValue' (Líquido)
            if (originalRes.netValue !== undefined && originalRes.value !== undefined) {
                feeAmount = Number(originalRes.value) - Number(originalRes.netValue);
            }
        }
        else if (gatewayName === 'CIELO') {
            // A Cielo não costuma retornar a taxa de desconto direto na API transacional.
            // Deixamos null para o financialService.js aplicar a ESTIMATIVAS_TAXAS.
            feeAmount = null; 
        }
        else if (gatewayName === 'STRIPE') {
            // Stripe retorna detalhes de fee apenas em rotas específicas (Balance Transactions).
            // Deixamos null para usar a estimativa.
            feeAmount = null; 
        }
        else if (gatewayName === 'ABACATEPAY') {
            // AbacatePay: Adapte se eles retornarem a fee direto no objeto.
            // Se não retornam na hora, deixe null.
            feeAmount = null;
        }
    }

    return {
        id: customId || originalRes?.id || `off_${Date.now()}`,
        status: normalizedStatus,       
        gateway: gatewayName,
        pix_data: pixData,
        fee_amount: feeAmount, // 🟢 NOVO: A taxa capturada é enviada para o Controller
        original_response: originalRes || { message: "Pagamento presencial" }  
    };
};

const GATEWAY_STRATEGIES = {
    
    OFFLINE: {
        OFFLINE_CASH: async () => formatResponse(null, 'DINHEIRO', 'pending', null, `dinheiro_${Date.now()}`),
        OFFLINE_CREDIT: async () => formatResponse(null, 'MAQUININHA_CREDITO', 'pending', null, `maq_cred_${Date.now()}`),
        OFFLINE_DEBIT: async () => formatResponse(null, 'MAQUININHA_DEBITO', 'pending', null, `maq_deb_${Date.now()}`),
        OFFLINE_PIX: async () => formatResponse(null, 'MAQUININHA_PIX', 'pending', null, `maq_pix_${Date.now()}`)
    },

    MERCADOPAGO: {
        PIX: async (dados, id_tenant) => {
            const res = await mpPix(dados, id_tenant);
            
            if (!res || !res.point_of_interaction) {
                throw new Error("Mercado Pago não retornou dados do QR Code.");
            }

            return formatResponse(res, 'MERCADOPAGO', 'pending', {
                qr_code: res.point_of_interaction.transaction_data.qr_code,
                qr_code_base64: res.point_of_interaction.transaction_data.qr_code_base64,
                expiration: res.date_of_expiration
            });
        },
        CREDITCARD: async (dados, id_tenant) => {
            const res = await mpCartao(dados, id_tenant);
            const status = res.status === 'approved' ? 'approved' : 'pending';
            return formatResponse(res, 'MERCADOPAGO', status);
        },
        DEBITCARD: async (dados, id_tenant) => {
            const res = await mpDebito(dados, id_tenant);
            const status = res.status === 'approved' ? 'approved' : 'pending';
            return formatResponse(res, 'MERCADOPAGO', status);
        },
        WALLET: async (dados, id_tenant) => {
            const res = await mpCarteira(dados, id_tenant);
            const status = res.status === 'approved' ? 'approved' : 'pending';
            return formatResponse(res, 'MERCADOPAGO', status);
        },
        BOLETO: async (dados, id_tenant) => {
            const res = await mpBoleto(dados, id_tenant);
            
            return {
                id: res.id,
                status: res.status || 'pending',
                gateway: 'MERCADOPAGO',
                payment_method: 'BOLETO',
                boleto_data: {
                    url_boleto: res.transaction_details?.external_resource_url,
                    linha_digitavel: res.barcode?.content,
                    expiration: res.date_of_expiration
                },
                original_response: res
            };
        }
    }, 

    CIELO: {
        CREDITCARD: async (dados, id_tenant) => {
            const res = await criarPagamentoCartaoCielo(dados, 'CreditCard', id_tenant);
            const statusMap = { 1: 'approved', 2: 'approved', 0: 'pending', 10: 'pending' }; 
            
            const cieloStatus = res.original_response.Payment ? res.original_response.Payment.Status : res.status;
            const status = statusMap[cieloStatus] || 'pending';
            
            return formatResponse(res.original_response, 'CIELO', status, null, res.id);
        },
        DEBITCARD: async (dados, id_tenant) => {
            const res = await criarPagamentoCartaoCielo(dados, 'DebitCard', id_tenant);
            const authUrl = res.original_response.Payment ? res.original_response.Payment.AuthenticationUrl : null;
            
            return {
                id: res.id,
                status: 'pending',
                gateway: 'CIELO',
                redirect_url: authUrl, 
                original_response: res.original_response
            };
        },
        PIX: async (dados, id_tenant) => {
            const res = await criarPagamentoPixCielo(dados, id_tenant);
            return formatResponse(res.original_response, 'CIELO', 'pending', res.pix_data, res.id);
        },
        BOLETO: async (dados, id_tenant) => {
            const res = await criarPagamentoBoletoCielo(dados, id_tenant);
            return {
                id: res.id,
                status: 'pending',
                gateway: 'CIELO',
                payment_method: 'BOLETO',
                boleto_data: res.boleto_data,
                url_boleto: res.boleto_data.url_boleto,
                original_response: res.original_response
            };
        },
        WALLET: async (dados, id_tenant) => {
            const res = await criarPagamentoQrCodeCielo(dados, id_tenant);
            return formatResponse(res.original_response, 'CIELO', 'pending', res.pix_data, res.id);
        }
    },

    STRIPE: {
        CREDITCARD: async (dados, id_tenant) => {
            const res = await criarPagamentoStripe(dados, id_tenant);
            return formatResponse(res.original_response, 'STRIPE', res.status, null, res.id);
        },
        PIX: async (dados, id_tenant) => {
             if (typeof criarPagamentoPixStripe === 'function') {
                 return await criarPagamentoPixStripe(dados, id_tenant);
             }
             throw new Error("Pix não suportado ou não configurado no Stripe.");
        },
        BOLETO: async (dados, id_tenant) => {
            if (typeof criarPagamentoBoletoStripe === 'function') {
                return await criarPagamentoBoletoStripe(dados, id_tenant);
            }
            throw new Error("Boleto não suportado ou não configurado no Stripe.");
        }
    },

    ASAAS: {
        PIX: async (dados, id_tenant) => {
            const res = await criarPixAsaas(dados, id_tenant);
            return formatResponse(res.original_response, 'ASAAS', 'pending', res.pix_data, res.id);
        },
        
        BOLETO: async (dados, id_tenant) => {
            const res = await criarBoletoAsaas(dados, id_tenant);
            return {
                id: res.id,
                status: 'pending',
                gateway: 'ASAAS',
                payment_method: 'BOLETO',
                boleto_data: res.boleto_data,
                url_boleto: res.url_pdf,
                original_response: res.original_response
            };
        },

        CREDITCARD: async (dados, id_tenant) => {
            if (!dados.card) {
                throw new Error("Dados do cartão não fornecidos.");
            }
            const res = await criarCartaoAsaas(dados, id_tenant);
            return formatResponse(res.original_response, 'ASAAS', res.status, null, res.id);
        }
    },

    ABACATEPAY: {
        PIX: async (dados, id_tenant) => {
            const res = await criarCobrancaAbacate(dados, ["PIX"], id_tenant);
            
            const codigoPixFinal = res.pix_data.qr_code || res.pix_data.qr_code_url || res.payment_url;

            return formatResponse(res.original_response, 'ABACATEPAY', 'pending', {
                qr_code: codigoPixFinal,
                qr_code_base64: res.pix_data.qr_code_base64,
                qr_code_url: res.pix_data.qr_code_url || res.payment_url
            }, res.id);
        },

        CREDITCARD: async (dados, id_tenant) => {
            const res = await criarCobrancaAbacate(dados, ["CREDIT_CARD", "PIX"], id_tenant); 
            return {
                id: res.id,
                status: 'pending', 
                gateway: 'ABACATEPAY',
                payment_url: res.payment_url, 
                original_response: res.original_response
            };
        },

        DEBITCARD: async (dados, id_tenant) => {
            const res = await criarCobrancaAbacate(dados, ["PIX"], id_tenant); 
            return {
                id: res.id,
                status: 'pending',
                gateway: 'ABACATEPAY',
                payment_url: res.payment_url,
                original_response: res.original_response
            };
        }
    },
};

const formatGatewayName = (name) => {
    const map = {
        'MERCADOPAGO': 'Mercado Pago',
        'STRIPE': 'Stripe',
        'ASAAS': 'Asaas',
        'ABACATEPAY': 'AbacatePay',
        'CIELO': 'Cielo',
        'OFFLINE': 'Pagamento na Entrega'
    };
    return map[name] || name;
};

export const getAvailableStrategies = () => {
    const options = {};

    Object.keys(GATEWAY_STRATEGIES).forEach(gateway => {
        const methods = Object.keys(GATEWAY_STRATEGIES[gateway]);
        
        methods.forEach(method => {
            if (!options[method]) {
                options[method] = [];
            }
            options[method].push({
                value: gateway,
                label: formatGatewayName(gateway)
            });
        });
    });

    return options;
};

export const processarPagamento = async (metodoPagamento, dados, id_tenant) => {
    
    // 🟢 Verificação de segurança adicional
    if (!metodoPagamento) {
        throw new Error("Método de pagamento não fornecido.");
    }

    // 🟢 Bypass para métodos OFFLINE
    if (String(metodoPagamento).toUpperCase().includes('OFFLINE')) {
        console.log(`✅ Factory: Método offline [${metodoPagamento}] detectado.`);
        return {
            id: `OFF-${Date.now()}`,
            status: 'approved', // O status é 'approved' para o sistema avançar
            gateway: 'OFFLINE'
        };
    }

    const rawMethod = metodoPagamento ? metodoPagamento.toUpperCase().replace(/[^A-Z_]/g, '') : '';

    const DB_METHOD_MAP = {
        'CREDITCARD': 'CREDIT_CARD',
        'DEBITCARD':  'DEBIT_CARD',
        'PIX':        'PIX',
        'BOLETO':     'BOLETO',
        'WALLET':     'WALLET',
        'OFFLINECASH': 'OFFLINE_CASH',
        'OFFLINECREDIT': 'OFFLINE_CREDIT',
        'OFFLINEDEBIT': 'OFFLINE_DEBIT',
        'OFFLINEPIX': 'OFFLINE_PIX'
    };

    const methodKey = DB_METHOD_MAP[rawMethod] || rawMethod;

    console.log(`🔍 Routing: Consultando rota ativa no Banco de Dados para [${methodKey}] (Original: ${rawMethod})...`);

    let rule = null;
    try {
        rule = await GatewayRuleModel.getByMethod(methodKey, id_tenant);
    } catch (err) {
        console.error("⚠️ Erro ao ler regras de pagamento do banco:", err.message);
    }

    if (!rule) {
        try {
            if (methodKey !== rawMethod) {
                console.log(`⚠️ Tentando buscar pela chave original [${rawMethod}]...`);
                rule = await GatewayRuleModel.getByMethod(rawMethod, id_tenant);
            }
        } catch (e) {}
    }

    if (!rule) {
        throw new Error(`Método de pagamento ${methodKey} não configurado ou não encontrado no sistema.`);
    }

    if (!rule.is_active) {
        throw new Error(`O método de pagamento ${methodKey} está temporariamente desativado pela loja.`);
    }

    const gatewayKey = rule.provider.toUpperCase(); 

    console.log(`🏭 Factory: Rota definida -> Processar via [${gatewayKey}]`);

    const executeStrategy = async (gw, method) => {
        const strategy = GATEWAY_STRATEGIES[gw];
        if (!strategy) throw new Error(`Gateway ${gw} não implementado no código.`);
        
        let methodFunc = strategy[rawMethod] || strategy[method];
        
        if (!methodFunc) {
            const REVERSE_MAP = { 
                'CREDIT_CARD': 'CREDITCARD', 
                'DEBIT_CARD': 'DEBITCARD',
                'OFFLINE_CASH': 'OFFLINE_CASH', 
                'OFFLINE_CREDIT': 'OFFLINE_CREDIT',
                'OFFLINE_DEBIT': 'OFFLINE_DEBIT',
                'OFFLINE_PIX': 'OFFLINE_PIX',
            };
            const strategyMethod = REVERSE_MAP[method] || method;
            methodFunc = strategy[strategyMethod];
        }

        if (!methodFunc) throw new Error(`Método ${method} não suportado pelo gateway ${gw}`);
        return await methodFunc(dados, id_tenant);
    };

    try {
        const resultado = await executeStrategy(gatewayKey, methodKey);
        
        if (!resultado.gateway) {
            resultado.gateway = gatewayKey;
        }

        console.log(`✅ Sucesso via ${gatewayKey}`);
        return resultado;

    } catch (error) {
        console.error(`🔥 Falha no gateway principal (${gatewayKey}): ${error.message}`);

        if (methodKey === 'PIX' && gatewayKey !== 'OFFLINE') {
            const priorityList = ['MERCADOPAGO', 'ASAAS', 'ABACATEPAY'];
            const fallbacks = priorityList.filter(g => g !== gatewayKey);
            
            for (const fallbackGw of fallbacks) {
                try {
                    console.log(`🔄 Tentando Fallback PIX via [${fallbackGw}]...`);
                    const resFallback = await GATEWAY_STRATEGIES[fallbackGw]['PIX'](dados, id_tenant);
                    resFallback.gateway = fallbackGw; 
                    return resFallback;
                } catch (errFallback) {
                    console.warn(`⚠️ Fallback ${fallbackGw} falhou: ${errFallback.message}`);
                }
            }
        }

        if (methodKey === 'BOLETO' && gatewayKey !== 'ASAAS') {
            try {
                console.log("🔄 Redirecionando Boleto para ASAAS (Fallback)...");
                const resAsaas = await GATEWAY_STRATEGIES['ASAAS']['BOLETO'](dados, id_tenant);
                resAsaas.gateway = 'ASAAS';
                return resAsaas;
            } catch (errAsaas) {
                console.error("Erro no fallback Boleto Asaas:", errAsaas.message);
            }
        }

        throw error; 
    }
};