import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// --- Listas de Chaves ---
const MERCADOLIVRE_KEYS = ['MERCADO_LIVRE_APP_ID', 'MERCADO_LIVRE_SECRET_KEY', 'MERCADO_LIVRE_ACCESS_TOKEN', 'MERCADO_LIVRE_REFRESH_TOKEN'];
const TIKTOK_KEYS = ['TIKTOK_APP_KEY', 'TIKTOK_APP_SECRET', 'TIKTOK_SHOP_ID'];
const MERCADOPAGO_KEYS = ['MERCADOPAGO_PUBLIC_KEY', 'MERCADOPAGO_ACCESS_TOKEN'];

// --- Funções Genéricas Auxiliares ---
const getKeyStatus = async (keys) => {
    const settings = await prisma.configuracoes.findMany({
        where: { chave: { in: keys } },
    });
    const status = settings.reduce((acc, { chave, valor }) => ({ ...acc, [chave]: !!valor }), {});
    keys.forEach(key => { if (!status[key]) status[key] = false; });
    return status;
};

const updateKeys = async (keys, newValues) => {
    const promises = keys.map(key => {
        if (newValues[key] !== undefined) {
            return prisma.configuracoes.upsert({
                where: { chave: key },
                update: { valor: newValues[key] },
                create: { chave: key, valor: newValues[key] },
            });
        }
        return Promise.resolve();
    });
    await Promise.all(promises);
};

// --- Funções para o Mercado Livre ---
export const getMercadoLivreKeyStatus = async (req, res, next) => {
    try {
        res.json(await getKeyStatus(MERCADOLIVRE_KEYS));
    } catch (error) {
        next(error);
    }
};
export const updateMercadoLivreKey = async (req, res, next) => {
    try {
        await updateKeys(MERCADOLIVRE_KEYS, req.body);
        res.json({ message: 'Chaves do Mercado Livre atualizadas com sucesso!' });
    } catch (error) {
        next(error);
    }
};

// --- Funções para o TikTok ---
export const getTikTokKeyStatus = async (req, res, next) => {
    try {
        res.json(await getKeyStatus(TIKTOK_KEYS));
    } catch (error) {
        next(error);
    }
};
export const updateTikTokKeys = async (req, res, next) => {
    try {
        await updateKeys(TIKTOK_KEYS, req.body);
        res.json({ message: 'Chaves do TikTok Shop atualizadas com sucesso!' });
    } catch (error) {
        next(error);
    }
};

// --- Funções para o Mercado Pago ---
export const getMercadoPagoGatewayKeys = async (req, res, next) => {
    try {
        res.json(await getKeyStatus(MERCADOPAGO_KEYS));
    } catch (error) {
        next(error);
    }
};

export const updateMercadoPagoGatewayKeys = async (req, res, next) => {
    try {
        // ✅ CORREÇÃO: A lógica agora usa a função auxiliar 'updateKeys'
        // que guarda os valores como texto puro, sem criptografia.
        await updateKeys(MERCADOPAGO_KEYS, req.body);
        res.json({ message: 'Chaves do Mercado Pago atualizadas com sucesso!' });
    } catch (error) {
        next(error);
    }
};

