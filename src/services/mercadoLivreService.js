import axios from 'axios';
import ConfiguracaoModel from '../models/configuracaoModel.js';

const refreshAccessToken = async (id_tenant) => {
    console.log(`🔄 Renovando Access Token do Mercado Livre para a loja ${id_tenant}...`);
    try {
        const refreshToken = await ConfiguracaoModel.get('MERCADO_LIVRE_REFRESH_TOKEN', id_tenant);
        const clientId = await ConfiguracaoModel.get('MERCADO_LIVRE_APP_ID', id_tenant);
        const clientSecret = await ConfiguracaoModel.get('MERCADO_LIVRE_SECRET_KEY', id_tenant);

        if (!refreshToken || !clientId || !clientSecret) {
            throw new Error('Credenciais do Mercado Livre não configuradas.');
        }

        const { data } = await axios.post('https://api.mercadolibre.com/oauth/token', null, {
            params: {
                grant_type: 'refresh_token',
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
            },
        });

        await ConfiguracaoModel.set('MERCADO_LIVRE_ACCESS_TOKEN', data.access_token, id_tenant);
        await ConfiguracaoModel.set('MERCADO_LIVRE_REFRESH_TOKEN', data.refresh_token, id_tenant);

        console.log(`✅ Access Token renovado com sucesso para a loja ${id_tenant}!`);
        return data.access_token;
    } catch (error) {
        console.error("❌ Erro crítico ao renovar Access Token:", error.response?.data || error.message);
        throw new Error('Não foi possível renovar o Access Token do Mercado Livre.');
    }
};

export const getValidAccessToken = async (id_tenant) => {
    let accessToken = await ConfiguracaoModel.get('MERCADO_LIVRE_ACCESS_TOKEN', id_tenant);

    if (!accessToken) {
        throw new Error('Access Token do Mercado Livre não configurado.');
    }

    try {
        await axios.get('https://api.mercadolibre.com/users/me', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        return accessToken; 
    } catch (error) {
        if (error.response && (error.response.status === 401 || error.response.status === 403 || error.response.data?.message === 'invalid access token')) {
            return await refreshAccessToken(id_tenant);
        }
        throw error;
    }
};