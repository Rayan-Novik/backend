import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { dispatchWebhook } from '../services/webhookService.js';

const prisma = new PrismaClient();

const MERCADOLIVRE_KEYS = ['MERCADO_LIVRE_APP_ID', 'MERCADO_LIVRE_SECRET_KEY', 'MERCADO_LIVRE_ACCESS_TOKEN', 'MERCADO_LIVRE_REFRESH_TOKEN'];
const TIKTOK_KEYS = ['TIKTOK_APP_KEY', 'TIKTOK_APP_SECRET', 'TIKTOK_SHOP_ID'];
const MERCADOPAGO_KEYS = ['MERCADOPAGO_PUBLIC_KEY', 'MERCADOPAGO_ACCESS_TOKEN'];
const IMGBB_KEYS = ['IMGBB_API_KEY'];
const CLOUDINARY_KEYS = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
const STRIPE_KEYS = ['STRIPE_PUBLIC_KEY', 'STRIPE_SECRET_KEY'];
const CIELO_KEYS = ['CIELO_MERCHANT_ID', 'CIELO_MERCHANT_KEY', 'CIELO_SANDBOX'];
const ASAAS_KEYS = ['ASAAS_API_KEY'];

// --- FUNÇÕES GENÉRICAS ADAPTADAS PARA SAAS ---

const getKeyStatus = async (keys, id_tenant) => {
    const settings = await prisma.configuracoes.findMany({
        where: { 
            chave: { in: keys },
            id_tenant: id_tenant 
        },
    });
    const status = settings.reduce((acc, { chave, valor }) => ({ ...acc, [chave]: !!valor }), {});
    keys.forEach(key => { if (!status[key]) status[key] = false; });
    return status;
};

const updateKeys = async (keys, newValues, id_tenant) => {
    const promises = keys.map(async (key) => {
        if (newValues[key] !== undefined) {
            const existing = await prisma.configuracoes.findFirst({
                where: { chave: key, id_tenant: id_tenant }
            });

            if (existing) {
                return prisma.configuracoes.updateMany({
                    where: { chave: key, id_tenant: id_tenant },
                    data: { valor: String(newValues[key]) }
                });
            } else {
                return prisma.configuracoes.create({
                    data: { chave: key, valor: String(newValues[key]), id_tenant: id_tenant }
                });
            }
        }
        return Promise.resolve();
    });
    await Promise.all(promises);
};

// --- Mercado Livre ---
export const getMercadoLivreKeyStatus = async (req, res, next) => {
    try { res.json(await getKeyStatus(MERCADOLIVRE_KEYS, req.tenantId)); } catch (error) { next(error); }
};
export const updateMercadoLivreKey = async (req, res, next) => {
    try { await updateKeys(MERCADOLIVRE_KEYS, req.body, req.tenantId); res.json({ message: 'Chaves atualizadas!' }); } catch (error) { next(error); }
};

// --- TikTok ---
export const getTikTokKeyStatus = async (req, res, next) => {
    try { res.json(await getKeyStatus(TIKTOK_KEYS, req.tenantId)); } catch (error) { next(error); }
};
export const updateTikTokKeys = async (req, res, next) => {
    try { await updateKeys(TIKTOK_KEYS, req.body, req.tenantId); res.json({ message: 'Chaves atualizadas!' }); } catch (error) { next(error); }
};

// --- Mercado Pago ---
export const getMercadoPagoGatewayKeys = async (req, res, next) => {
    try { res.json(await getKeyStatus(MERCADOPAGO_KEYS, req.tenantId)); } catch (error) { next(error); }
};
export const updateMercadoPagoGatewayKeys = async (req, res, next) => {
    try { await updateKeys(MERCADOPAGO_KEYS, req.body, req.tenantId); res.json({ message: 'Chaves do Mercado Pago atualizadas com sucesso!' }); } catch (error) { next(error); }
};

// --- Stripe ---
export const getStripeKeyStatus = async (req, res, next) => {
    try {
        const settings = await prisma.configuracoes.findMany({ 
            where: { chave: { in: STRIPE_KEYS }, id_tenant: req.tenantId } 
        });
        const keysObj = { STRIPE_PUBLIC_KEY: '', STRIPE_SECRET_KEY: '' };
        settings.forEach(item => { if (item.valor) keysObj[item.chave] = item.valor; });
        res.json(keysObj);
    } catch (error) { next(error); }
};

export const updateStripeKeys = async (req, res, next) => {
    try {
        const { publicKey, secretKey } = req.body;
        await updateKeys(STRIPE_KEYS, { 'STRIPE_PUBLIC_KEY': publicKey, 'STRIPE_SECRET_KEY': secretKey }, req.tenantId);
        res.json({ message: 'Chaves do Stripe atualizadas!' });
    } catch (error) { next(error); }
};

// --- Asaas ---
export const getAsaasKeyStatus = async (req, res, next) => {
    try {
        const settings = await prisma.configuracoes.findMany({
            where: { chave: { in: ASAAS_KEYS }, id_tenant: req.tenantId },
        });

        const keysObj = { ASAAS_API_KEY: '' };
        settings.forEach(item => {
            if (item.valor) keysObj[item.chave] = item.valor;
        });

        res.json(keysObj);
    } catch (error) {
        next(error);
    }
};

export const updateAsaasKeys = async (req, res, next) => {
    try {
        await updateKeys(ASAAS_KEYS, req.body, req.tenantId);
        res.json({ message: 'Chave do Asaas atualizada com sucesso!' });
    } catch (error) {
        next(error);
    }
};

// --- IMGBB ---
export const getImgBBKeyStatus = async (req, res, next) => {
    try { res.json(await getKeyStatus(IMGBB_KEYS, req.tenantId)); } catch (error) { next(error); }
};

export const updateImgBBKey = async (req, res, next) => {
    try { await updateKeys(IMGBB_KEYS, req.body, req.tenantId); res.json({ message: 'Chave atualizada!' }); } catch (error) { next(error); }
};

// --- Cloudinary ---
export const getCloudinaryKeys = async (req, res, next) => {
    try {
        const settings = await prisma.configuracoes.findMany({ 
            where: { chave: { in: CLOUDINARY_KEYS }, id_tenant: req.tenantId } 
        });
        const keysObj = { CLOUDINARY_CLOUD_NAME: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '' };
        settings.forEach(item => { if (item.valor) keysObj[item.chave] = item.valor; });
        res.json(keysObj);
    } catch (error) { next(error); }
};

export const updateCloudinaryKeys = async (req, res, next) => {
    try { await updateKeys(CLOUDINARY_KEYS, req.body, req.tenantId); res.json({ message: 'Chaves atualizadas!' }); } catch (error) { next(error); }
};

// --- Facebook ---
export const getFacebookKeys = async (req, res) => {
    try {
        const chaves = await prisma.configuracoes.findMany({
            where: { 
                chave: { in: ['FB_PIXEL_ID', 'FB_PAGE_ID', 'FB_PAGE_TOKEN', 'FB_CATALOG_ID', 'FB_AD_ACCOUNT_ID'] },
                id_tenant: req.tenantId
            }
        });
        const keysObj = {};
        chaves.forEach(item => { keysObj[item.chave] = item.valor; });
        res.json(keysObj);
    } catch (error) { res.status(500).json({ error: "Erro ao buscar chaves" }); }
};

export const updateFacebookKeys = async (req, res) => {
    try {
        const data = req.body; 
        const chavesPermitidas = ['FB_PIXEL_ID', 'FB_PAGE_ID', 'FB_PAGE_TOKEN', 'FB_CATALOG_ID', 'FB_AD_ACCOUNT_ID'];
        
        const chavesParaAtualizar = {};
        Object.keys(data).forEach(k => {
            if(chavesPermitidas.includes(k)) chavesParaAtualizar[k] = data[k];
        });

        await updateKeys(chavesPermitidas, chavesParaAtualizar, req.tenantId);
        res.json({ message: "Configurações salvas!" });
    } catch (error) { res.status(500).json({ error: "Erro ao salvar chaves" }); }
};

// --- Cielo ---
export const getCieloKeyStatus = async (req, res, next) => {
    try {
        const settings = await prisma.configuracoes.findMany({
            where: { chave: { in: CIELO_KEYS }, id_tenant: req.tenantId },
        });

        const keysObj = { CIELO_MERCHANT_ID: '', CIELO_MERCHANT_KEY: '', CIELO_SANDBOX: 'false' };
        
        settings.forEach(item => {
            if (item.valor) keysObj[item.chave] = item.valor;
        });

        res.json(keysObj);
    } catch (error) {
        next(error);
    }
};

export const updateCieloKeys = async (req, res, next) => {
    try {
        await updateKeys(CIELO_KEYS, req.body, req.tenantId);
        res.json({ message: 'Chaves da Cielo atualizadas com sucesso!' });
    } catch (error) {
        next(error);
    }
};

// ============================================================================
// 🚀 NOVAS ROTAS: API PÚBLICA (Integrações Externas)
// ============================================================================

// Listar todas as chaves criadas por esta loja
export const getPublicApiKeys = async (req, res) => {
    try {
        const keys = await prisma.api_keys.findMany({
            where: { tenant_id: req.tenantId },
            orderBy: { criado_em: 'desc' }
        });
        res.json(keys);
    } catch (error) {
        res.status(500).json({ error: "Erro ao buscar chaves de API pública." });
    }
};

// Gerar uma nova chave de integração
export const createPublicApiKey = async (req, res) => {
    try {
        // 🚀 RECEBEMOS O isTest DO FRONTEND
        const { nome, permissoes, isTest } = req.body;
        
        if (!nome || nome.trim() === '') {
            return res.status(400).json({ error: "O nome da integração é obrigatório." });
        }

        // Pega o ID da loja de onde quer que o middleware tenha salvado
        const tenantId = req.user?.id_tenant || req.usuario?.id_tenant || req.tenant_id || req.user?.tenant_id || req.tenantId;

        if (!tenantId) {
            console.error("⚠️ ERRO: ID da loja não encontrado no request.");
            return res.status(401).json({ error: 'Não foi possível identificar a loja logada.' });
        }

        // 🚀 MAGIA DO SANDBOX: Define o prefixo correto
        const prefixo = isTest ? 'sk_test_' : 'sk_live_';

        // Gera 24 bytes aleatórios e converte para hexadecimal (muito seguro)
        const rawToken = crypto.randomBytes(24).toString('hex');
        
        // 🚀 Cria a chave final com o prefixo correto
        const novaChave = `${prefixo}${rawToken}`; 

        // Converte o array de permissões para JSON
        const permissoesParaSalvar = permissoes && Array.isArray(permissoes) 
            ? JSON.stringify(permissoes) 
            : JSON.stringify([]);

        const apiKey = await prisma.api_keys.create({
            data: {
                nome: nome,
                chave: novaChave,
                ativo: true,
                permissoes: permissoesParaSalvar,
                tenant: {
                    connect: { 
                        id: Number(tenantId) 
                    }
                }
            }
        });

        res.status(201).json(apiKey);
    } catch (error) {
        console.error("Erro ao gerar chave pública da API:", error);
        res.status(500).json({ error: "Erro interno ao criar chave de API pública." });
    }
};

// Deletar (Revogar) uma chave de integração
export const deletePublicApiKey = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verifica se a chave existe E se pertence a este tenant (segurança)
        const key = await prisma.api_keys.findFirst({
            where: { id: parseInt(id), tenant_id: req.tenantId }
        });

        if (!key) {
            return res.status(404).json({ error: "Chave não encontrada ou acesso negado." });
        }

        await prisma.api_keys.delete({
            where: { id: parseInt(id) }
        });

        res.json({ message: "Integração revogada com sucesso!" });
    } catch (error) {
        res.status(500).json({ error: "Erro ao revogar chave de API." });
    }
};

export const saveWebhookSettings = async (req, res) => {
    try {
        const { url } = req.body;
        const tenantId = req.user?.id_tenant || req.usuario?.id_tenant || req.tenant_id || req.user?.tenant_id || req.tenantId;

        if (!url) return res.status(400).json({ error: 'A URL é obrigatória.' });

        const existente = await prisma.tenant_webhooks.findFirst({
            where: { id_tenant: Number(tenantId), evento: 'pedido.pago' }
        });

        if (existente) {
            await prisma.tenant_webhooks.update({
                where: { id: existente.id },
                data: { url: url }
            });
        } else {
            await prisma.tenant_webhooks.create({
                data: { id_tenant: Number(tenantId), url: url, evento: 'pedido.pago' }
            });
        }

        res.json({ message: 'Webhook configurado com sucesso!' });
    } catch (error) {
        console.error("Erro ao salvar webhook:", error);
        res.status(500).json({ error: 'Erro interno ao salvar webhook.' });
    }
};

export const testWebhook = async (req, res) => {
    try {
        const tenantId = req.user?.id_tenant || req.usuario?.id_tenant || req.tenant_id || req.user?.tenant_id || req.tenantId;
        
        // Simula os dados de um pedido aprovado
        const payloadFake = {
            id_pedido: "TESTE-123", 
            valor_total: 157.90, 
            metodo_pagamento: "PIX",
            cliente: { nome: "Lojista Teste", email: "admin@ararinhacloud.shop" }
        };

        await dispatchWebhook(Number(tenantId), 'pedido.pago', payloadFake);
        
        res.json({ message: "Webhook de teste disparado com sucesso!" });
    } catch (error) {
        console.error("Erro no teste de webhook:", error);
        res.status(500).json({ error: "Erro ao disparar webhook." });
    }
};

export const getWebhookSettings = async (req, res) => {
    try {
        const tenantId = req.user?.id_tenant || req.usuario?.id_tenant || req.tenant_id || req.user?.tenant_id || req.tenantId;

        const webhook = await prisma.tenant_webhooks.findFirst({
            where: { id_tenant: Number(tenantId), evento: 'pedido.pago' }
        });

        res.json({ 
            url: webhook?.url || '', 
            evento: 'pedido.pago' 
        });
    } catch (error) {
        console.error("Erro ao buscar configurações do webhook:", error);
        res.status(500).json({ error: 'Erro interno ao buscar o webhook.' });
    }
};