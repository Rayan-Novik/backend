import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Lista de chaves de configuração que este módulo irá gerir
const SOCIAL_KEYS = [
    'LINK_FACEBOOK',
    'LINK_INSTAGRAM',
    'LINK_TIKTOK',
    'WHATSAPP_NUMERO',
    'WHATSAPP_MENSAGEM',
    'WHATSAPP_ATIVO'
];

/**
 * @desc    Obter todas as configurações de redes sociais
 * @route   GET /api/social-media
 * @access  Private/Admin
 */
export const getSocialMediaSettings = async (req, res, next) => {
    try {
        const settings = await prisma.configuracoes.findMany({
            where: { chave: { in: SOCIAL_KEYS } }
        });

        // Transforma a lista de configurações num objeto mais fácil de usar no frontend
        const settingsMap = settings.reduce((acc, setting) => {
            acc[setting.chave] = setting.valor;
            return acc;
        }, {});

        res.json(settingsMap);
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Atualizar as configurações de redes sociais
 * @route   PUT /api/social-media
 * @access  Private/Admin
 */
export const updateSocialMediaSettings = async (req, res, next) => {
    try {
        const newSettings = req.body;

        // Cria uma lista de promessas para atualizar cada configuração
        const updatePromises = SOCIAL_KEYS.map(key => {
            const value = newSettings[key] !== undefined ? String(newSettings[key]) : '';
            return prisma.configuracoes.upsert({
                where: { chave: key },
                update: { valor: value },
                create: { chave: key, valor: value },
            });
        });

        // Executa todas as atualizações em paralelo
        await Promise.all(updatePromises);

        res.json({ message: 'Configurações de redes sociais atualizadas com sucesso!' });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Obter configurações públicas para o botão do WhatsApp
 * @route   GET /api/social-media/whatsapp-config
 * @access  Public
 */
export const getWhatsAppConfig = async (req, res, next) => {
    try {
        const keysToFetch = ['WHATSAPP_ATIVO', 'WHATSAPP_NUMERO', 'WHATSAPP_MENSAGEM'];
        const settings = await prisma.configuracoes.findMany({
            where: { chave: { in: keysToFetch } }
        });

        const configMap = settings.reduce((acc, setting) => {
            acc[setting.chave] = setting.valor;
            return acc;
        }, {});

        res.json({
            active: configMap.WHATSAPP_ATIVO === 'true',
            number: configMap.WHATSAPP_NUMERO || '',
            message: configMap.WHATSAPP_MENSAGEM || 'Olá! Tenho interesse nos seus produtos.',
        });
    } catch (error) {
        next(error);
    }
};
