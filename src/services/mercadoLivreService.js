import axios from 'axios';
import ConfiguracaoModel from '../models/configuracaoModel.js';

/**
 * Renova o Access Token usando o Refresh Token.
 * @returns {Promise<string>} O novo Access Token.
 */
const refreshAccessToken = async () => {
    console.log('🔄 A renovar o Access Token do Mercado Livre...');
    try {
        // Busca todas as credenciais necessárias do banco de dados
        const refreshToken = await ConfiguracaoModel.get('MERCADO_LIVRE_REFRESH_TOKEN');
        const clientId = await ConfiguracaoModel.get('MERCADO_LIVRE_APP_ID');
        const clientSecret = await ConfiguracaoModel.get('MERCADO_LIVRE_SECRET_KEY');

        if (!refreshToken || !clientId || !clientSecret) {
            throw new Error('Credenciais do Mercado Livre (App ID, Secret Key, Refresh Token) não configuradas para renovação.');
        }

        const { data } = await axios.post('https://api.mercadolibre.com/oauth/token', null, {
            params: {
                grant_type: 'refresh_token',
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
            },
        });

        // Guarda os novos tokens no banco de dados para uso futuro
        await ConfiguracaoModel.set('MERCADO_LIVRE_ACCESS_TOKEN', data.access_token);
        await ConfiguracaoModel.set('MERCADO_LIVRE_REFRESH_TOKEN', data.refresh_token);

        console.log('✅ Access Token renovado com sucesso!');
        return data.access_token;
    } catch (error) {
        console.error("❌ Erro crítico ao renovar o Access Token:", error.response?.data || error.message);
        throw new Error('Não foi possível renovar o Access Token do Mercado Livre.');
    }
};

/**
 * Obtém um Access Token válido, testando o atual e renovando-o se estiver inválido.
 * @returns {Promise<string>} Um Access Token válido.
 */
export const getValidAccessToken = async () => {
    let accessToken = await ConfiguracaoModel.get('MERCADO_LIVRE_ACCESS_TOKEN');

    if (!accessToken) {
        throw new Error('Access Token do Mercado Livre não configurado no painel de administração.');
    }

    try {
        // Testa o token fazendo uma chamada leve e segura à API para verificar a sua validade
        await axios.get('https://api.mercadolibre.com/users/me', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        // Se a chamada acima não der erro, o token está válido.
        return accessToken; 
    } catch (error) {
        // Se recebermos um erro de "não autorizado", significa que o token expirou.
        if (error.response && (error.response.status === 401 || error.response.status === 403 || error.response.data?.message === 'invalid access token')) {
            return await refreshAccessToken();
        }
        // Para qualquer outro erro de rede, etc., lança a exceção.
        throw error;
    }
};