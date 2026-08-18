import ConfiguracaoModel from '../models/configuracaoModel.js';
import { PrismaClient } from '@prisma/client';
import { getWhatsAppStatus } from '../services/whatsapp/connection.js';

const prisma = new PrismaClient();

// ✅ Recupera as configurações de aparência para o PAINEL ADMIN
export const getAppearanceSettings = async (req, res, next) => {
    try {
        const [
            headerPrimary, headerSecondary, footerColor, logoUrl,
            siteTitle, faviconUrl, bodyBg, siteTextColor,
            btnPrimaryBg, btnPrimaryText, layoutStyle 
        ] = await Promise.all([
            ConfiguracaoModel.get('HEADER_PRIMARY_COLOR', req.tenantId),
            ConfiguracaoModel.get('HEADER_SECONDARY_COLOR', req.tenantId),
            ConfiguracaoModel.get('FOOTER_COLOR', req.tenantId),
            ConfiguracaoModel.get('LOGO_URL', req.tenantId),
            ConfiguracaoModel.get('SITE_TITLE', req.tenantId),
            ConfiguracaoModel.get('FAVICON_URL', req.tenantId),
            ConfiguracaoModel.get('BODY_BG_COLOR', req.tenantId),
            ConfiguracaoModel.get('SITE_TEXT_COLOR', req.tenantId),
            ConfiguracaoModel.get('BTN_PRIMARY_BG', req.tenantId),
            ConfiguracaoModel.get('BTN_PRIMARY_TEXT', req.tenantId),
            ConfiguracaoModel.get('STORE_LAYOUT_STYLE', req.tenantId)
        ]);

        res.json({
            HEADER_PRIMARY_COLOR: headerPrimary || '#ffffff',
            HEADER_SECONDARY_COLOR: headerSecondary || '#f8f9fa',
            FOOTER_COLOR: footerColor || '#212529',
            LOGO_URL: logoUrl || '',
            SITE_TITLE: siteTitle || 'Minha Loja',
            FAVICON_URL: faviconUrl || '',
            BODY_BG_COLOR: bodyBg || '#f8f9fa',
            SITE_TEXT_COLOR: siteTextColor || '#212529',
            BTN_PRIMARY_BG: btnPrimaryBg || '#0d6efd',
            BTN_PRIMARY_TEXT: btnPrimaryText || '#ffffff',
            STORE_LAYOUT_STYLE: layoutStyle || 'ECOMMERCE'
        });
    } catch (error) {
        next(error);
    }
};

// ✅ ROTA PÚBLICA: Recupera todas as configurações para o SITE (Frontend)
export const getStorePublicConfig = async (req, res, next) => {
    try {
        const slugOrId = req.params.tenantId;
        let tenantId = parseInt(slugOrId);

        if (isNaN(tenantId)) {
            const lojaInfo = await prisma.tenants.findFirst({
                where: { slug: slugOrId } 
            });

            if (!lojaInfo) {
                return res.status(404).json({ message: 'Loja não encontrada.' });
            }
            tenantId = lojaInfo.id; 
        } else if (!tenantId) {
            tenantId = 1; 
        }

        const [
            headerPrimary, headerSecondary, footerColor, logoUrl,
            siteTitle, faviconUrl, bodyBg, siteTextColor,
            btnPrimaryBg, btnPrimaryText, layoutRaw, layoutStyle,
            pixAtivo, pixPorcentagem, retiradaAtiva, consumoLocalAtivo 
        ] = await Promise.all([
            ConfiguracaoModel.get('HEADER_PRIMARY_COLOR', tenantId),
            ConfiguracaoModel.get('HEADER_SECONDARY_COLOR', tenantId),
            ConfiguracaoModel.get('FOOTER_COLOR', tenantId),
            ConfiguracaoModel.get('LOGO_URL', tenantId),
            ConfiguracaoModel.get('SITE_TITLE', tenantId),
            ConfiguracaoModel.get('FAVICON_URL', tenantId),
            ConfiguracaoModel.get('BODY_BG_COLOR', tenantId),
            ConfiguracaoModel.get('SITE_TEXT_COLOR', tenantId),
            ConfiguracaoModel.get('BTN_PRIMARY_BG', tenantId),
            ConfiguracaoModel.get('BTN_PRIMARY_TEXT', tenantId),
            ConfiguracaoModel.get('HOMEPAGE_LAYOUT', tenantId),
            ConfiguracaoModel.get('STORE_LAYOUT_STYLE', tenantId),
            ConfiguracaoModel.get('pix_desconto_ativo', tenantId),
            ConfiguracaoModel.get('pix_desconto_porcentagem', tenantId),
            ConfiguracaoModel.get('RETIRADA_ATIVA', tenantId), // 🟢 Adicionado para o Frontend
            ConfiguracaoModel.get('CONSUMO_LOCAL_ATIVO', tenantId) // 🟢 Adicionado para o Frontend
        ]);

        // 🟢 A MÁGICA AQUI: Pega o status do WhatsApp do lojista
        let isWhatsappActive = false;
        try {
            const whatsStatus = getWhatsAppStatus(String(tenantId));
            if (whatsStatus && whatsStatus.status === 'CONNECTED') {
                isWhatsappActive = true;
            }
        } catch (e) {
            console.log(`Erro ao checar status do WhatsApp na config pública para tenant ${tenantId}`);
        }

        res.json({
            HEADER_PRIMARY_COLOR: headerPrimary || '#ffffff',
            HEADER_SECONDARY_COLOR: headerSecondary || '#f8f9fa',
            FOOTER_COLOR: footerColor || '#212529',
            LOGO_URL: logoUrl || '', 
            SITE_TITLE: siteTitle || 'Minha Loja',
            FAVICON_URL: faviconUrl || '',
            BODY_BG_COLOR: bodyBg || '#f8f9fa',
            SITE_TEXT_COLOR: siteTextColor || '#212529',
            BTN_PRIMARY_BG: btnPrimaryBg || '#0d6efd',
            BTN_PRIMARY_TEXT: btnPrimaryText || '#ffffff',
            HOMEPAGE_LAYOUT: layoutRaw || JSON.stringify(['banner', 'vitrine']),
            STORE_LAYOUT_STYLE: layoutStyle || 'ECOMMERCE',
            PIX_DESCONTO_ATIVO: pixAtivo === 'true', 
            PIX_DESCONTO_PORCENTAGEM: Number(pixPorcentagem || 0),
            WHATSAPP_ATIVO: isWhatsappActive,
            RETIRADA_ATIVA: retiradaAtiva === 'true', // 🟢 Expondo para o React
            CONSUMO_LOCAL_ATIVO: consumoLocalAtivo === 'true' // 🟢 Expondo para o React
        });
    } catch (error) {
        next(error);
    }
};

// ✅ Atualiza as configurações de aparência (Admin)
export const updateAppearanceSettings = async (req, res, next) => {
    try {
        const { 
            HEADER_PRIMARY_COLOR, HEADER_SECONDARY_COLOR, FOOTER_COLOR, 
            LOGO_URL, SITE_TITLE, FAVICON_URL, BODY_BG_COLOR, 
            SITE_TEXT_COLOR, BTN_PRIMARY_BG, BTN_PRIMARY_TEXT, STORE_LAYOUT_STYLE
        } = req.body;

        const updates = [
            ConfiguracaoModel.set('HEADER_PRIMARY_COLOR', HEADER_PRIMARY_COLOR, req.tenantId),
            ConfiguracaoModel.set('HEADER_SECONDARY_COLOR', HEADER_SECONDARY_COLOR, req.tenantId),
            ConfiguracaoModel.set('FOOTER_COLOR', FOOTER_COLOR, req.tenantId)
        ];

        if (LOGO_URL !== undefined) updates.push(ConfiguracaoModel.set('LOGO_URL', LOGO_URL, req.tenantId));
        if (SITE_TITLE !== undefined) updates.push(ConfiguracaoModel.set('SITE_TITLE', SITE_TITLE, req.tenantId));
        if (FAVICON_URL !== undefined) updates.push(ConfiguracaoModel.set('FAVICON_URL', FAVICON_URL, req.tenantId));
        if (BODY_BG_COLOR) updates.push(ConfiguracaoModel.set('BODY_BG_COLOR', BODY_BG_COLOR, req.tenantId));
        if (SITE_TEXT_COLOR) updates.push(ConfiguracaoModel.set('SITE_TEXT_COLOR', SITE_TEXT_COLOR, req.tenantId));
        if (BTN_PRIMARY_BG) updates.push(ConfiguracaoModel.set('BTN_PRIMARY_BG', BTN_PRIMARY_BG, req.tenantId));
        if (BTN_PRIMARY_TEXT) updates.push(ConfiguracaoModel.set('BTN_PRIMARY_TEXT', BTN_PRIMARY_TEXT, req.tenantId));
        if (STORE_LAYOUT_STYLE) updates.push(ConfiguracaoModel.set('STORE_LAYOUT_STYLE', STORE_LAYOUT_STYLE, req.tenantId));

        await Promise.all(updates);
        res.json({ message: 'Identidade visual atualizada com sucesso!' });
    } catch (error) {
        next(error);
    }
};

export const getPixDiscountConfig = async (req, res, next) => {
    try {
        const ativo = await ConfiguracaoModel.get('pix_desconto_ativo', req.tenantId);
        const porcentagem = await ConfiguracaoModel.get('pix_desconto_porcentagem', req.tenantId);
        res.json({
            ativo: ativo === 'true', 
            porcentagem: Number(porcentagem || 0)
        });
    } catch (error) {
        next(error);
    }
};

export const updatePixDiscountConfig = async (req, res, next) => {
    try {
        const { ativo, porcentagem } = req.body;
        await ConfiguracaoModel.set('pix_desconto_ativo', String(ativo), req.tenantId);
        await ConfiguracaoModel.set('pix_desconto_porcentagem', String(porcentagem), req.tenantId);
        res.json({ message: 'Configuração de desconto Pix atualizada!' });
    } catch (error) {
        next(error);
    }
};

export const getPaymentConfig = async (req, res, next) => {
    try {
        const [mpPublicKey, stripePublicKey, activeGateway] = await Promise.all([
            ConfiguracaoModel.get('MERCADOPAGO_PUBLIC_KEY', req.tenantId),
            ConfiguracaoModel.get('STRIPE_PUBLIC_KEY', req.tenantId),
            ConfiguracaoModel.get('ACTIVE_GATEWAY', req.tenantId)
        ]);
        res.json({
            mpPublicKey: mpPublicKey ? mpPublicKey.trim() : null,
            stripePublicKey: stripePublicKey ? stripePublicKey.trim() : null,
            activeGateway: activeGateway || 'MERCADOPAGO'
        });
    } catch (error) {
        next(error);
    }
};

export const getPublicConfiguracoes = async (req, res, next) => {
    try {
        const configs = {
             RECOMENDACOES_ATIVO: await ConfiguracaoModel.get('RECOMENDACOES_ATIVO', req.tenantId)
        };
        res.json(configs);
    } catch (error) {
        next(error);
    }
};

export const getHomepageLayout = async (req, res, next) => {
    try {
        const layoutRaw = await ConfiguracaoModel.get('HOMEPAGE_LAYOUT', req.tenantId);
        if (!layoutRaw) return res.json([]);
        res.json(JSON.parse(layoutRaw));
    } catch (error) {
        next(error);
    }
};

export const updateHomepageLayout = async (req, res, next) => {
    try {
        const { layout } = req.body;
        if (!layout || !Array.isArray(layout)) return res.status(400).json({ message: 'Layout inválido' });
        await ConfiguracaoModel.set('HOMEPAGE_LAYOUT', JSON.stringify(layout), req.tenantId);
        res.json({ message: 'Layout da página inicial atualizado com sucesso!' });
    } catch (error) {
        next(error);
    }
};

// 🟢 NOVAS FUNÇÕES ADICIONADAS AQUI PARA O ERRO 404 DO /gerais

// 🟢 BUSCAR TODAS AS CONFIGURAÇÕES GERAIS DA LOJA
export const getConfiguracoesGerais = async (req, res) => {
    try {
        const configuracoes = await prisma.configuracoes.findMany({
            where: { id_tenant: req.tenantId }
        });
        res.json(configuracoes);
    } catch (error) {
        res.status(500).json({ message: "Erro ao buscar configurações.", error: error.message });
    }
};

// 🟢 SALVAR/ATUALIZAR CONFIGURAÇÕES (Dinâmico para qualquer chave)
export const updateConfiguracoesGerais = async (req, res) => {
    try {
        const configuracoes = req.body; // Ex: { RETIRADA_ATIVA: "true", CONSUMO_LOCAL_ATIVO: "false" }
        const id_tenant = req.tenantId;

        // Usa o ConfiguracaoModel nativo para garantir que a criptografia do sistema seja aplicada!
        const promessas = Object.entries(configuracoes).map(([chave, valor]) => {
            return ConfiguracaoModel.set(String(chave), String(valor), id_tenant);
        });

        await Promise.all(promessas);

        res.json({ message: "Configurações atualizadas com sucesso!" });
    } catch (error) {
        console.error("Erro ao atualizar configurações:", error);
        res.status(500).json({ message: "Erro ao atualizar configurações.", error: error.message });
    }
};

// =========================================================

export const getConfiguracaoByKey = async (req, res, next) => {
    try {
        const { chave } = req.params;
        let valor = await ConfiguracaoModel.get(chave, req.tenantId);
        if (!valor) {
            if (chave === 'UPLOAD_PROVIDER') valor = 'imgbb';
            if (chave === 'ACTIVE_GATEWAY') valor = 'MERCADOPAGO';
        }
        res.json({ chave, valor });
    } catch (error) {
        next(error);
    }
};

export const saveConfiguracao = async (req, res, next) => {
    try {
        const { chave, valor } = req.body;
        if (!chave) return res.status(400).json({ message: 'Chave é obrigatória.' });
        await ConfiguracaoModel.set(chave, valor, req.tenantId);
        res.json({ message: 'Configuração salva com sucesso.', chave, valor });
    } catch (error) {
        next(error);
    }
};

export const updateConfiguracao = saveConfiguracao;