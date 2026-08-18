import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const SOCIAL_KEYS = [
    'LINK_FACEBOOK',
    'FACEBOOK_ATIVO',
    'LINK_INSTAGRAM',
    'INSTAGRAM_ATIVO',
    'LINK_TIKTOK',
    'TIKTOK_ATIVO',
    'WHATSAPP_NUMERO',
    'WHATSAPP_MENSAGEM',
    'WHATSAPP_ATIVO'
];

export const getSocialMediaSettings = async (req, res, next) => {
    try {
        const settings = await prisma.configuracoes.findMany({
            where: { 
                chave: { in: SOCIAL_KEYS },
                id_tenant: req.tenantId
            }
        });

        const settingsMap = settings.reduce((acc, setting) => {
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

export const updateSocialMediaSettings = async (req, res, next) => {
    try {
        const newSettings = req.body;

        const updatePromises = SOCIAL_KEYS.map(async (key) => {
            let value = '';
            if (newSettings[key] !== undefined) {
                value = String(newSettings[key]); 
            }

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
                    data: { valor: value }
                });
            } else {
                return prisma.configuracoes.create({
                    data: { 
                        chave: key, 
                        valor: value,
                        id_tenant: req.tenantId
                    }
                });
            }
        });

        await Promise.all(updatePromises);

        res.json({ message: 'Configurações de redes sociais atualizadas com sucesso!' });
    } catch (error) {
        next(error);
    }
};

export const getWhatsAppConfig = async (req, res, next) => {
    try {
        const keysToFetch = ['WHATSAPP_ATIVO', 'WHATSAPP_NUMERO', 'WHATSAPP_MENSAGEM'];
        const settings = await prisma.configuracoes.findMany({
            where: { 
                chave: { in: keysToFetch },
                id_tenant: req.tenantId
            }
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