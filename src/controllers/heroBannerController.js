import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Lista de chaves de configuração que este módulo irá gerir
const HERO_BANNER_KEYS = [
    'HERO_BANNER_URL',
    'HERO_BANNER_LINK',
    'HERO_BANNER_TITLE',
    'HERO_BANNER_SUBTITLE',
    'HERO_BANNER_ACTIVE'
];

/**
 * @desc    Obter todas as configurações do banner principal para o painel de admin
 * @route   GET /api/hero-banner/settings
 * @access  Private/Admin
 */
export const getHeroBannerSettings = async (req, res, next) => {
    try {
        const settings = await prisma.configuracoes.findMany({
            where: { chave: { in: HERO_BANNER_KEYS } }
        });

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
 * @desc    Atualizar as configurações do banner principal
 * @route   PUT /api/hero-banner/settings
 * @access  Private/Admin
 */
export const updateHeroBannerSettings = async (req, res, next) => {
    try {
        const newSettings = req.body;
        const updatePromises = HERO_BANNER_KEYS.map(key => {
            const value = newSettings[key] !== undefined ? String(newSettings[key]) : '';
            return prisma.configuracoes.upsert({
                where: { chave: key },
                update: { valor: value },
                create: { chave: key, valor: value },
            });
        });

        await Promise.all(updatePromises);
        res.json({ message: 'Banner principal atualizado com sucesso!' });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Obter a configuração do banner ativo para exibir na loja
 * @route   GET /api/hero-banner
 * @access  Public
 */
export const getActiveHeroBanner = async (req, res, next) => {
    try {
        const settings = await prisma.configuracoes.findMany({
            where: { chave: { in: HERO_BANNER_KEYS } }
        });
        const configMap = settings.reduce((acc, setting) => {
            acc[setting.chave] = setting.valor;
            return acc;
        }, {});

        if (configMap.HERO_BANNER_ACTIVE === 'true') {
            res.json({
                imageUrl: configMap.HERO_BANNER_URL,
                link: configMap.HERO_BANNER_LINK,
                title: configMap.HERO_BANNER_TITLE,
                subtitle: configMap.HERO_BANNER_SUBTITLE,
            });
        } else {
            // Se o banner estiver inativo, retorna nulo para o frontend não o renderizar
            res.json(null);
        }
    } catch (error) {
        next(error);
    }
};
