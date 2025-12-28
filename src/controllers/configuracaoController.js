import ConfiguracaoModel from '../models/configuracaoModel.js';

// @desc    Buscar as configurações de aparência
export const getAppearanceSettings = async (req, res, next) => {
    try {
        const headerPrimaryColor = await ConfiguracaoModel.get('HEADER_PRIMARY_COLOR');
        const headerSecondaryColor = await ConfiguracaoModel.get('HEADER_SECONDARY_COLOR');
        const footerColor = await ConfiguracaoModel.get('FOOTER_COLOR');
        const logoUrl = await ConfiguracaoModel.get('LOGO_URL');
        
        // ✅ BUSCAR OS NOVOS DADOS
        const siteTitle = await ConfiguracaoModel.get('SITE_TITLE');
        const faviconUrl = await ConfiguracaoModel.get('FAVICON_URL');

        res.json({
            HEADER_PRIMARY_COLOR: headerPrimaryColor || '#ffc107',
            HEADER_SECONDARY_COLOR: headerSecondaryColor || '#0d6efd',
            FOOTER_COLOR: footerColor || '#212529',
            LOGO_URL: logoUrl || '/logoheader.png',
            // ✅ RETORNAR OS NOVOS DADOS
            SITE_TITLE: siteTitle || '',
            FAVICON_URL: faviconUrl || ''
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Atualizar as configurações de aparência (Admin)
export const updateAppearanceSettings = async (req, res, next) => {
    try {
        // ✅ RECEBER OS NOVOS DADOS DO BODY
        const { 
            HEADER_PRIMARY_COLOR, 
            HEADER_SECONDARY_COLOR, 
            FOOTER_COLOR, 
            LOGO_URL,
            SITE_TITLE,   // <--- Novo
            FAVICON_URL   // <--- Novo
        } = req.body;

        await ConfiguracaoModel.set('HEADER_PRIMARY_COLOR', HEADER_PRIMARY_COLOR);
        await ConfiguracaoModel.set('HEADER_SECONDARY_COLOR', HEADER_SECONDARY_COLOR);
        await ConfiguracaoModel.set('FOOTER_COLOR', FOOTER_COLOR);
        await ConfiguracaoModel.set('LOGO_URL', LOGO_URL);

        // ✅ SALVAR NO BANCO
        if (SITE_TITLE !== undefined) await ConfiguracaoModel.set('SITE_TITLE', SITE_TITLE);
        if (FAVICON_URL !== undefined) await ConfiguracaoModel.set('FAVICON_URL', FAVICON_URL);

        res.json({ message: 'Configurações de aparência atualizadas com sucesso!' });
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