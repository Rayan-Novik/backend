import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// --- Listas de Chaves ---
const MERCADOLIVRE_KEYS = ['MERCADO_LIVRE_APP_ID', 'MERCADO_LIVRE_SECRET_KEY', 'MERCADO_LIVRE_ACCESS_TOKEN', 'MERCADO_LIVRE_REFRESH_TOKEN'];
const TIKTOK_KEYS = ['TIKTOK_APP_KEY', 'TIKTOK_APP_SECRET', 'TIKTOK_SHOP_ID'];
const MERCADOPAGO_KEYS = ['MERCADOPAGO_PUBLIC_KEY', 'MERCADOPAGO_ACCESS_TOKEN'];
const IMGBB_KEYS = ['IMGBB_API_KEY']; // ✅ NOVA LISTA

// --- Funções Genéricas Auxiliares ---
const getKeyStatus = async (keys) => {
    const settings = await prisma.configuracoes.findMany({
        where: { chave: { in: keys } },
    });
    // Retorna true/false se a chave existe e tem valor
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
        await updateKeys(MERCADOPAGO_KEYS, req.body);
        res.json({ message: 'Chaves do Mercado Pago atualizadas com sucesso!' });
    } catch (error) {
        next(error);
    }
};

// --- ✅ NOVAS FUNÇÕES PARA O IMGBB ---
export const getImgBBKeyStatus = async (req, res, next) => {
    try {
        res.json(await getKeyStatus(IMGBB_KEYS));
    } catch (error) {
        next(error);
    }
};

export const updateImgBBKey = async (req, res, next) => {
    try {
        await updateKeys(IMGBB_KEYS, req.body);
        res.json({ message: 'Chave do ImgBB atualizada com sucesso!' });
    } catch (error) {
        next(error);
    }
};

export const getFacebookKeys = async (req, res) => {
    try {
        const chaves = await prisma.configuracoes.findMany({
            where: {
                chave: { in: ['FB_PIXEL_ID', 'FB_PAGE_ID', 'FB_PAGE_TOKEN', 'FB_CATALOG_ID', 'FB_AD_ACCOUNT_ID'] }
            }
        });

        // Converte o array do banco em um objeto amigável para o Frontend
        const keysObj = {};
        chaves.forEach(item => {
            keysObj[item.chave] = item.valor;
        });

        res.json(keysObj);
    } catch (error) {
        res.status(500).json({ error: "Erro ao buscar chaves do Facebook" });
    }
};

// Salvar ou Atualizar as chaves
export const updateFacebookKeys = async (req, res) => {
    try {
        const data = req.body; // Recebe o objeto com as chaves do modal

        // Faz um loop nos dados recebidos e salva cada um no banco
        const promises = Object.entries(data).map(([chave, valor]) => {
            return prisma.configuracoes.upsert({
                where: { chave },
                update: { valor: String(valor) },
                create: { chave, valor: String(valor) }
            });
        });

        await Promise.all(promises);
        res.json({ message: "Configurações salvas com sucesso!" });
    } catch (error) {
        res.status(500).json({ error: "Erro ao salvar chaves no banco de dados" });
    }
};