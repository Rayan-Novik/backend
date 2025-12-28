import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// ✅ Adicionei as chaves de ativação ('_ATIVO') para cada rede social
const SOCIAL_KEYS = [
    'LINK_FACEBOOK',
    'FACEBOOK_ATIVO',   // <--- Novo
    'LINK_INSTAGRAM',
    'INSTAGRAM_ATIVO',  // <--- Novo
    'LINK_TIKTOK',
    'TIKTOK_ATIVO',     // <--- Novo
    'WHATSAPP_NUMERO',
    'WHATSAPP_MENSAGEM',
    'WHATSAPP_ATIVO'
];

/**
 * @desc    Obter todas as configurações de redes sociais
 * @route   GET /api/social-media
 * @access  Public (Para o site carregar os ícones)
 */
export const getSocialMediaSettings = async (req, res, next) => {
    try {
        const settings = await prisma.configuracoes.findMany({
            where: { chave: { in: SOCIAL_KEYS } }
        });

        // Transforma a lista de configurações num objeto
        const settingsMap = settings.reduce((acc, setting) => {
            // Converte strings "true"/"false" em booleanos reais para facilitar no frontend
            if (setting.chave.endsWith('_ATIVO')) {
                acc[setting.chave] = setting.valor === 'true';
            } else {
                acc[setting.chave] = setting.valor;
            }
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

        const updatePromises = SOCIAL_KEYS.map(key => {
            // Verifica se o valor veio no body. Se for booleano, converte para string.
            let value = '';
            if (newSettings[key] !== undefined) {
                value = String(newSettings[key]); // Converte true -> "true"
            }

            return prisma.configuracoes.upsert({
                where: { chave: key },
                update: { valor: value },
                create: { chave: key, valor: value },
            });
        });

        await Promise.all(updatePromises);

        res.json({ message: 'Configurações de redes sociais atualizadas com sucesso!' });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Obter configurações públicas para o botão do WhatsApp (Legado/Específico)
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