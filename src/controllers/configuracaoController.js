import ConfiguracaoModel from '../models/configuracaoModel.js';

// @desc    Buscar as configurações de aparência
export const getAppearanceSettings = async (req, res, next) => {
    try {
        // ✅ CORREÇÃO: Busca as duas cores do cabeçalho
        const headerPrimaryColor = await ConfiguracaoModel.get('HEADER_PRIMARY_COLOR');
        const headerSecondaryColor = await ConfiguracaoModel.get('HEADER_SECONDARY_COLOR');
        const footerColor = await ConfiguracaoModel.get('FOOTER_COLOR');
        const logoUrl = await ConfiguracaoModel.get('LOGO_URL');

        // ✅ CORREÇÃO: Envia a resposta com os nomes corretos das chaves
        res.json({
            HEADER_PRIMARY_COLOR: headerPrimaryColor || '#ffc107',
            HEADER_SECONDARY_COLOR: headerSecondaryColor || '#0d6efd',
            FOOTER_COLOR: footerColor || '#212529',
            LOGO_URL: logoUrl || '/logoheader.png',
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Atualizar as configurações de aparência (Admin)
export const updateAppearanceSettings = async (req, res, next) => {
    try {
        // ✅ CORREÇÃO: Recebe as duas cores do cabeçalho
        const { HEADER_PRIMARY_COLOR, HEADER_SECONDARY_COLOR, FOOTER_COLOR, LOGO_URL } = req.body;

        // ✅ CORREÇÃO: Guarda cada configuração com a sua chave correta
        await ConfiguracaoModel.set('HEADER_PRIMARY_COLOR', HEADER_PRIMARY_COLOR);
        await ConfiguracaoModel.set('HEADER_SECONDARY_COLOR', HEADER_SECONDARY_COLOR);
        await ConfiguracaoModel.set('FOOTER_COLOR', FOOTER_COLOR);
        await ConfiguracaoModel.set('LOGO_URL', LOGO_URL);

        res.json({ message: 'Configurações de aparência atualizadas com sucesso!' });
    } catch (error) {
        next(error);
    }
};

export const getPublicConfiguracoes = async (req, res, next) => {
    try {
        // Define quais chaves são seguras para serem expostas publicamente
        const chavesPublicas = ['RECOMENDACOES_ATIVO'];
        const configs = await ConfiguracaoModel.getMultiple(chavesPublicas);
        res.json(configs);
    } catch (error) {
        next(error);
    }
};