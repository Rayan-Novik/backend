import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const HERO_BANNER_KEYS = [
    // Básico
    'HERO_BANNER_URL',
    'HERO_BANNER_LINK',
    'HERO_BANNER_ACTIVE',
    
    // Conteúdo e Cores
    'HERO_BANNER_TITLE',
    'HERO_BANNER_TITLE_COLOR',
    'HERO_BANNER_SUBTITLE',
    'HERO_BANNER_SUB_COLOR',
    'HERO_BANNER_BTN_TEXT',
    'HERO_BANNER_BTN_BG',
    'HERO_BANNER_BTN_TEXT_COLOR',
    
    // Estilos Visuais (Tamanho, Rotação, Borda, Bold)
    'HERO_BANNER_TITLE_SIZE',
    'HERO_BANNER_TITLE_ROTATION',
    'HERO_BANNER_TITLE_BOLD',      // Novo
    'HERO_BANNER_TITLE_BG',        // Novo
    'HERO_BANNER_TITLE_PADDING',   // Novo
    'HERO_BANNER_TITLE_RADIUS',    // Novo
    
    'HERO_BANNER_SUB_SIZE',
    'HERO_BANNER_SUB_ROTATION',
    'HERO_BANNER_SUB_BOLD',        // Novo
    'HERO_BANNER_SUB_BG',          // Novo
    'HERO_BANNER_SUB_PADDING',     // Novo
    'HERO_BANNER_SUB_RADIUS',      // Novo
    
    'HERO_BANNER_BTN_RADIUS', 

    'HERO_BANNER_HEIGHT',
    'HERO_BANNER_TITLE_POS_X', 'HERO_BANNER_TITLE_POS_Y',
    
    // Posições Individuais (X e Y)
    'HERO_BANNER_TITLE_POS_X',
    'HERO_BANNER_TITLE_POS_Y',
    'HERO_BANNER_SUB_POS_X',
    'HERO_BANNER_SUB_POS_Y',
    'HERO_BANNER_BTN_POS_X',
    'HERO_BANNER_BTN_POS_Y'
];

export const getHeroBannerSettings = async (req, res, next) => {
    try {
        const settings = await prisma.configuracoes.findMany({
            where: {
                chave: { in: HERO_BANNER_KEYS },
                id_tenant: req.tenantId
            }
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

export const updateHeroBannerSettings = async (req, res, next) => {
    try {
        const newSettings = req.body;
        const updatePromises = HERO_BANNER_KEYS.map(async (key) => {
            const value = newSettings[key] !== undefined ? String(newSettings[key]) : '';

            const existing = await prisma.configuracoes.findFirst({
                where: { chave: key, id_tenant: req.tenantId }
            });

            if (existing) {
                return prisma.configuracoes.updateMany({
                    where: { chave: key, id_tenant: req.tenantId },
                    data: { valor: value }
                });
            } else {
                return prisma.configuracoes.create({
                    data: { chave: key, valor: value, id_tenant: req.tenantId }
                });
            }
        });

        await Promise.all(updatePromises);
        res.json({ message: 'Banner principal atualizado com sucesso!' });
    } catch (error) {
        next(error);
    }
};

export const getActiveHeroBanner = async (req, res, next) => {
    try {
        // 🟢 Pega o tenantId da URL (ex: /hero-banner/public/1)
        const tenantId = parseInt(req.params.tenantId) || 1;

        const settings = await prisma.configuracoes.findMany({
            where: { 
                chave: { in: HERO_BANNER_KEYS },
                id_tenant: tenantId 
            }
        });
        
        const configMap = settings.reduce((acc, setting) => {
            acc[setting.chave] = setting.valor;
            return acc;
        }, {});

        // Só retorna os dados se o banner estiver ativo
        if (configMap.HERO_BANNER_ACTIVE === 'true') {
            res.json(configMap); // 🟢 Retorna TODAS as chaves do map para o frontend
        } else {
            res.json(null);
        }
    } catch (error) {
        next(error);
    }
};