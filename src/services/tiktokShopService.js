import axios from 'axios';
import ConfiguracaoModel from '../models/configuracaoModel.js';

/**
 * Renova o Access Token do TikTok Shop.
 * NOTA: Esta é uma implementação de exemplo. A URL e os parâmetros exatos
 * podem variar dependendo da versão da API do TikTok Shop.
 * @returns {Promise<string>} O novo Access Token.
 */
const refreshTikTokToken = async () => {
    console.log('🔄 A renovar o Access Token do TikTok Shop...');
    try {
        const refreshToken = await ConfiguracaoModel.get('TIKTOK_REFRESH_TOKEN');
        const appKey = await ConfiguracaoModel.get('TIKTOK_APP_KEY');
        const appSecret = await ConfiguracaoModel.get('TIKTOK_APP_SECRET');

        if (!refreshToken || !appKey || !appSecret) {
            throw new Error('Credenciais do TikTok (App Key, App Secret, Refresh Token) não configuradas.');
        }

        // A URL e a estrutura do body podem precisar de ser ajustadas
        // de acordo com a documentação oficial do TikTok Shop Partner API.
        const { data } = await axios.post('https://auth.tiktok-shops.com/api/v2/token/refresh', {
            grant_type: 'refresh_token',
            app_key: appKey,
            app_secret: appSecret,
            refresh_token: refreshToken,
        });

        // Guarda os novos tokens no banco de dados
        await ConfiguracaoModel.set('TIKTOK_ACCESS_TOKEN', data.access_token);
        await ConfiguracaoModel.set('TIKTOK_REFRESH_TOKEN', data.refresh_token);

        console.log('✅ Access Token do TikTok renovado com sucesso!');
        return data.access_token;
    } catch (error) {
        console.error("❌ Erro crítico ao renovar o Access Token do TikTok:", error.response?.data || error.message);
        throw new Error('Não foi possível renovar o Access Token do TikTok.');
    }
};

/**
 * Obtém um Access Token válido para o TikTok Shop.
 * NOTA: A forma de validar o token (o endpoint '/api/shop/get_authorized_shop') é um exemplo.
 * @returns {Promise<string>} Um Access Token válido.
 */
export const getValidTikTokAccessToken = async () => {
    let accessToken = await ConfiguracaoModel.get('TIKTOK_ACCESS_TOKEN');

    if (!accessToken) {
        throw new Error('Access Token do TikTok não configurado.');
    }

    try {
        // Testa o token fazendo uma chamada leve à API
        const appKey = await ConfiguracaoModel.get('TIKTOK_APP_KEY');
        const shopId = await ConfiguracaoModel.get('TIKTOK_SHOP_ID');
        
        await axios.get('https://open-api.tiktokglobalshop.com/api/shop/get_authorized_shop', {
            params: {
                app_key: appKey,
                shop_id: shopId,
                access_token: accessToken,
            }
        });
        
        return accessToken;
    } catch (error) {
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
            return await refreshTikTokToken();
        }
        throw error;
    }
};
