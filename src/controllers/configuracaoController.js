import ConfiguracaoModel from '../models/configuracaoModel.js';

// @desc    Buscar as configurações de aparência
export const getAppearanceSettings = async (req, res, next) => {
    try {
        const [
            headerPrimary, headerSecondary, footerColor, logoUrl,
            siteTitle, faviconUrl, bodyBg, siteTextColor,
            btnPrimaryBg, btnPrimaryText
        ] = await Promise.all([
            ConfiguracaoModel.get('HEADER_PRIMARY_COLOR'),
            ConfiguracaoModel.get('HEADER_SECONDARY_COLOR'),
            ConfiguracaoModel.get('FOOTER_COLOR'),
            ConfiguracaoModel.get('LOGO_URL'),
            ConfiguracaoModel.get('SITE_TITLE'),
            ConfiguracaoModel.get('FAVICON_URL'),
            ConfiguracaoModel.get('BODY_BG_COLOR'),
            ConfiguracaoModel.get('SITE_TEXT_COLOR'),
            ConfiguracaoModel.get('BTN_PRIMARY_BG'),
            ConfiguracaoModel.get('BTN_PRIMARY_TEXT')
        ]);

        res.json({
            HEADER_PRIMARY_COLOR: headerPrimary || '#ffc107',
            HEADER_SECONDARY_COLOR: headerSecondary || '#0d6efd',
            FOOTER_COLOR: footerColor || '#212529',
            LOGO_URL: logoUrl || '/logoheader.png',
            SITE_TITLE: siteTitle || 'Minha Loja',
            FAVICON_URL: faviconUrl || '',
            // ✅ RETORNANDO AS NOVAS CORES
            BODY_BG_COLOR: bodyBg || '#f8f9fa',
            SITE_TEXT_COLOR: siteTextColor || '#212529',
            BTN_PRIMARY_BG: btnPrimaryBg || '#0d6efd',
            BTN_PRIMARY_TEXT: btnPrimaryText || '#ffffff'
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Atualizar as configurações de aparência (Admin)
export const updateAppearanceSettings = async (req, res, next) => {
    try {
        const { 
            HEADER_PRIMARY_COLOR, 
            HEADER_SECONDARY_COLOR, 
            FOOTER_COLOR, 
            LOGO_URL,
            SITE_TITLE,
            FAVICON_URL,
            // ✅ RECEBENDO NOVOS DADOS
            BODY_BG_COLOR,
            SITE_TEXT_COLOR,
            BTN_PRIMARY_BG,
            BTN_PRIMARY_TEXT
        } = req.body;

        const updates = [
            ConfiguracaoModel.set('HEADER_PRIMARY_COLOR', HEADER_PRIMARY_COLOR),
            ConfiguracaoModel.set('HEADER_SECONDARY_COLOR', HEADER_SECONDARY_COLOR),
            ConfiguracaoModel.set('FOOTER_COLOR', FOOTER_COLOR),
            ConfiguracaoModel.set('LOGO_URL', LOGO_URL)
        ];

        // Salvamento condicional para evitar sobrescrever com "undefined"
        if (SITE_TITLE !== undefined) updates.push(ConfiguracaoModel.set('SITE_TITLE', SITE_TITLE));
        if (FAVICON_URL !== undefined) updates.push(ConfiguracaoModel.set('FAVICON_URL', FAVICON_URL));
        if (BODY_BG_COLOR) updates.push(ConfiguracaoModel.set('BODY_BG_COLOR', BODY_BG_COLOR));
        if (SITE_TEXT_COLOR) updates.push(ConfiguracaoModel.set('SITE_TEXT_COLOR', SITE_TEXT_COLOR));
        if (BTN_PRIMARY_BG) updates.push(ConfiguracaoModel.set('BTN_PRIMARY_BG', BTN_PRIMARY_BG));
        if (BTN_PRIMARY_TEXT) updates.push(ConfiguracaoModel.set('BTN_PRIMARY_TEXT', BTN_PRIMARY_TEXT));

        await Promise.all(updates);

        res.json({ message: 'Identidade visual atualizada com sucesso!' });
    } catch (error) {
        next(error);
    }
};

// @desc    Buscar configurações do Desconto PIX
export const getPixDiscountConfig = async (req, res, next) => {
    try {
        const ativo = await ConfiguracaoModel.get('pix_desconto_ativo');
        const porcentagem = await ConfiguracaoModel.get('pix_desconto_porcentagem');

        res.json({
            ativo: ativo === 'true', // Converte string 'true' para boolean
            porcentagem: Number(porcentagem || 0)
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Atualizar configurações do Desconto PIX (Admin)
export const updatePixDiscountConfig = async (req, res, next) => {
    try {
        const { ativo, porcentagem } = req.body;

        // Salva como string no banco
        await ConfiguracaoModel.set('pix_desconto_ativo', String(ativo));
        await ConfiguracaoModel.set('pix_desconto_porcentagem', String(porcentagem));

        res.json({ message: 'Configuração de desconto Pix atualizada!' });
    } catch (error) {
        next(error);
    }
};

export const getPublicConfiguracoes = async (req, res, next) => {
    try {
        // Nota: Certifique-se que seu Model tem o método getMultiple implementado, 
        // caso contrário use Promise.all com ConfiguracaoModel.get
        const configs = {
             RECOMENDACOES_ATIVO: await ConfiguracaoModel.get('RECOMENDACOES_ATIVO')
        };
        res.json(configs);
    } catch (error) {
        next(error);
    }
};

export const getHomepageLayout = async (req, res, next) => {
    try {
        const layoutRaw = await ConfiguracaoModel.get('HOMEPAGE_LAYOUT');
        
        // Se não houver nada no banco, envia um array vazio ou ordem padrão
        if (!layoutRaw) {
            return res.json([]);
        }

        res.json(JSON.parse(layoutRaw));
    } catch (error) {
        next(error);
    }
};

// @desc    Atualizar a ordem do layout da Homepage (Admin)
export const updateHomepageLayout = async (req, res, next) => {
    try {
        const { layout } = req.body;

        if (!layout || !Array.isArray(layout)) {
            return res.status(400).json({ message: 'Layout inválido' });
        }

        // Salva o array como String JSON no banco
        await ConfiguracaoModel.set('HOMEPAGE_LAYOUT', JSON.stringify(layout));

        res.json({ message: 'Layout da página inicial atualizado com sucesso!' });
    } catch (error) {
        next(error);
    }
};