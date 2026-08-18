import { PrismaClient } from '@prisma/client';
import { getAvailableStrategies } from '../services/paymentFactory.js'; 

const prisma = new PrismaClient();

const GATEWAY_KEYS = [
    'MERCADOPAGO_ACCESS_TOKEN',
    'MERCADOPAGO_PUBLIC_KEY',
    'ASAAS_API_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_PUBLIC_KEY',
    'ABACATEPAY_API_KEY',
    'CIELO_MERCHANT_ID',
    'CIELO_MERCHANT_KEY',
    'CIELO_SANDBOX',
];

// ==========================================================
// 🟢 NOVA FUNÇÃO PÚBLICA PARA O CHECKOUT DA LOJA VIRTUAL
// ==========================================================
export const getActiveGatewaysForCheckout = async (req, res) => {
    try {
        const tenantId = req.headers['x-tenant-id'] || 1; 

        const regrasAtivas = await prisma.gateway_rules.findMany({
            where: { 
                id_tenant: Number(tenantId),
                is_active: true
            },
            select: {
                method: true,
                provider: true,
                is_active: true
            }
        });

        return res.json(regrasAtivas);
    } catch (error) {
        console.error("Erro getActiveGatewaysForCheckout:", error);
        return res.status(500).json({ error: "Erro ao carregar métodos de pagamento da loja." });
    }
};

// ==========================================================
// FUNÇÕES PROTEGIDAS (PAINEL ADMINISTRATIVO)
// ==========================================================
export const getRoutingRules = async (req, res) => {
    try {
        const rules = await prisma.gateway_rules.findMany({
            where: { id_tenant: req.tenantId },
            orderBy: { method: 'asc' }
        });
        return res.json(rules);
    } catch (error) {
        console.error("Erro getRoutingRules:", error);
        return res.status(500).json({ error: "Erro ao buscar regras." });
    }
};

export const updateRoutingRules = async (req, res) => {
    const { rules } = req.body;

    if (!rules || !Array.isArray(rules)) {
        return res.status(400).json({ error: "Dados inválidos." });
    }

    try {
        await prisma.$transaction(async (tx) => {
            for (const rule of rules) {
                const existingRule = await tx.gateway_rules.findFirst({
                    where: { 
                        method: rule.method,
                        id_tenant: req.tenantId 
                    }
                });

                if (existingRule) {
                    await tx.gateway_rules.updateMany({
                        where: { 
                            method: rule.method,
                            id_tenant: req.tenantId 
                        },
                        data: { 
                            provider: rule.provider, 
                            is_active: rule.is_active 
                        }
                    });
                } else {
                    await tx.gateway_rules.create({
                        data: {
                            method: rule.method, 
                            provider: rule.provider, 
                            is_active: rule.is_active,
                            id_tenant: req.tenantId
                        }
                    });
                }
            }
        });

        return res.json({ success: true, message: "Regras atualizadas com sucesso!" });
    } catch (error) {
        console.error("Erro updateRoutingRules:", error);
        return res.status(500).json({ error: "Falha ao salvar." });
    }
};

export const getPaymentOptions = (req, res) => {
    try {
        const options = getAvailableStrategies();
        return res.json(options);
    } catch (error) {
        console.error("Erro getPaymentOptions:", error);
        return res.status(500).json({ error: "Erro ao listar opções de gateways." });
    }
};

export const applyGlobalPreset = async (req, res) => {
    const { provider } = req.body;

    if (!provider) {
        return res.status(400).json({ error: "Provider não informado." });
    }

    try {
        await prisma.gateway_rules.updateMany({
            where: { id_tenant: req.tenantId },
            data: { 
                provider: provider,
                is_active: true 
            }
        });

        return res.json({ success: true, message: `Todos os métodos agora usam ${provider}` });
    } catch (error) {
        console.error("Erro applyGlobalPreset:", error);
        return res.status(500).json({ error: "Falha ao aplicar preset global." });
    }
};

export const getCredentials = async (req, res, next) => {
    try {
        const settings = await prisma.configuracoes.findMany({
            where: { 
                chave: { in: GATEWAY_KEYS },
                id_tenant: req.tenantId 
            }
        });
        const settingsMap = settings.reduce((acc, s) => {
            acc[s.chave] = s.valor;
            return acc;
        }, {});
        res.json(settingsMap);
    } catch (error) {
        if (next) next(error);
        else res.status(500).json({ error: error.message });
    }
};

export const updateCredentials = async (req, res, next) => {
    try {
        const newSettings = req.body;
        const promises = GATEWAY_KEYS.map(async (key) => {
            if (newSettings[key] !== undefined) {
                const existing = await prisma.configuracoes.findFirst({
                    where: { 
                        chave: key,
                        id_tenant: req.tenantId 
                    }
                });

                if (existing) {
                    return prisma.configuracoes.updateMany({
                        where: { 
                            chave: key,
                            id_tenant: req.tenantId 
                        },
                        data: { valor: String(newSettings[key]) }
                    });
                } else {
                    return prisma.configuracoes.create({
                        data: { 
                            chave: key, 
                            valor: String(newSettings[key]),
                            id_tenant: req.tenantId 
                        }
                    });
                }
            }
            return Promise.resolve();
        });
        
        await Promise.all(promises);
        res.json({ message: 'Chaves atualizadas com sucesso!' });
    } catch (error) {
        if (next) next(error);
        else res.status(500).json({ error: error.message });
    }
};

export const getPublicKeys = async (req, res, next) => {
    try {
        const tenantId = req.tenantId || req.headers['x-tenant-id'] || 1;

        const keys = await prisma.configuracoes.findMany({
            where: { 
                chave: { in: ['MERCADOPAGO_PUBLIC_KEY', 'STRIPE_PUBLIC_KEY'] },
                id_tenant: Number(tenantId)
            }
        });
        res.json({
            mercadopago: keys.find(k => k.chave === 'MERCADOPAGO_PUBLIC_KEY')?.valor || null,
            stripe: keys.find(k => k.chave === 'STRIPE_PUBLIC_KEY')?.valor || null
        });
    } catch (error) {
        if (next) next(error);
        else res.status(500).json({ error: error.message });
    }
};

export const getGatewayTaxes = async (req, res) => {
    try {
        const config = await prisma.SiteConfig.findFirst({
            where: { 
                chave: 'GATEWAY_TAXES',
                id_tenant: req.tenantId
            }
        });
        res.json(config ? config.valor : {});
    } catch (error) {
        res.status(500).json({ message: "Erro ao buscar taxas." });
    }
};

export const updateGatewayTaxes = async (req, res) => {
    try {
        const { taxes } = req.body;

        const existing = await prisma.SiteConfig.findFirst({
            where: {
                chave: 'GATEWAY_TAXES',
                id_tenant: req.tenantId
            }
        });

        if (existing) {
            await prisma.SiteConfig.update({
                where: { id: existing.id },
                data: { valor: taxes }
            });
        } else {
            await prisma.SiteConfig.create({
                data: {
                    id_tenant: req.tenantId || 1,
                    chave: 'GATEWAY_TAXES',
                    valor: taxes
                }
            });
        }
        res.json({ success: true });
    } catch (error) {
        console.error("Erro updateGatewayTaxes:", error);
        res.status(500).json({ message: "Erro ao salvar taxas." });
    }
};

// ==========================================================
// 🟢 LER CONFIGURAÇÃO GERAL DE GATEWAYS (EX: SINAL AGENDAMENTO)
// ==========================================================
export const getGatewayConfig = async (req, res, next) => {
    try {
        const { chave } = req.params;
        const id_tenant = req.tenantId;

        const config = await prisma.SiteConfig.findFirst({ 
            where: { chave: chave, id_tenant: id_tenant } 
        });

        res.status(200).json(config || { valor: "100" });
    } catch (error) {
        next(error);
    }
};

// ==========================================================
// 🟢 SALVAR CONFIGURAÇÃO GERAL DE GATEWAYS
// ==========================================================
export const setGatewayConfig = async (req, res, next) => {
    try {
        const { chave, valor } = req.body;
        const id_tenant = req.tenantId;

        const configExiste = await prisma.SiteConfig.findFirst({
            where: { chave: chave, id_tenant: id_tenant }
        });

        if (configExiste) {
            await prisma.SiteConfig.update({
                where: { id: configExiste.id },
                data: { valor: String(valor) }
            });
        } else {
            await prisma.SiteConfig.create({
                data: { 
                    chave: chave, 
                    valor: String(valor), 
                    id_tenant: id_tenant 
                }
            });
        }

        res.status(200).json({ success: true, message: "Configuração salva com sucesso!" });
    } catch (error) {
        next(error);
    }
};

export const getPaymentGatewaySettings = getCredentials;
export const updatePaymentGatewaySettings = updateCredentials;
export const getMercadoPagoPublicKey = getPublicKeys;

const GatewayConfigController = {
    getActiveGatewaysForCheckout, 
    getRoutingRules,
    updateRoutingRules,
    getPaymentOptions,
    applyGlobalPreset,
    getCredentials,
    updateCredentials,
    getPublicKeys,
    getPaymentGatewaySettings,
    updatePaymentGatewaySettings,
    getMercadoPagoPublicKey,
    getGatewayTaxes,
    updateGatewayTaxes,
    getGatewayConfig, // 🟢 NOVO
    setGatewayConfig  // 🟢 NOVO
};

export default GatewayConfigController;