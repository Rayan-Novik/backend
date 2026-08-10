import axios from 'axios';
import ConfiguracaoModel from '../../models/configuracaoModel.js';

export const handleMercadoPagoOAuthCallback = async (req, res) => {
    // O MP envia o 'code' na URL, e o 'state' traz o id_tenant que mandamos no frontend
    const { code, state: id_tenant } = req.query;

    if (!code || !id_tenant) {
        return res.status(400).send("Código de autorização ou Tenant ID ausente.");
    }

    try {
        console.log(`🔄 [OAUTH MP] Trocando código por credenciais para o Tenant ${id_tenant}...`);

        // Faz a requisição para trocar o código temporário pelas chaves reais do cliente
        const response = await axios.post('https://api.mercadopago.com/oauth/token', {
            client_id: process.env.MP_MASTER_CLIENT_ID, 
            client_secret: process.env.MP_MASTER_CLIENT_SECRET, 
            grant_type: 'authorization_code',
            code: code,
            // Use a string fixa aqui para garantir que bata com o painel do MP
            redirect_uri: "https://back.ararinhacloud.shop/api/webhooks/mercadopago/callback" 
        }, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            }
        });

        const { access_token, public_key, refresh_token } = response.data;

        // Salva as novas credenciais da loja no banco de dados usando o seu Model
        await ConfiguracaoModel.set('MERCADOPAGO_ACCESS_TOKEN', access_token, Number(id_tenant));
        await ConfiguracaoModel.set('MERCADOPAGO_PUBLIC_KEY', public_key, Number(id_tenant));
        await ConfiguracaoModel.set('MERCADOPAGO_REFRESH_TOKEN', refresh_token, Number(id_tenant)); 

        console.log(`✅ [OAUTH MP] Credenciais salvas com sucesso para o Tenant ${id_tenant}.`);

        // Redireciona o cliente de volta para o painel administrativo da loja dele
        res.redirect(`${process.env.ADMIN_URL}/admin/configuracoes?mp=success`);

    } catch (error) {
        console.error("❌ Erro no OAuth MP:", error.response?.data || error.message);
        // Redireciona com erro para o frontend exibir um alerta
        res.redirect(`${process.env.ADMIN_URL}/admin/configuracoes?mp=error`);
    }
};

export const renovarTokenMercadoPago = async (id_tenant) => {
    try {
        console.log(`🔄 [REFRESH MP] Tentando renovar token para o Tenant ${id_tenant}...`);

        // 1. Busca o Refresh Token atual do banco
        const refreshToken = await ConfiguracaoModel.get('MERCADOPAGO_REFRESH_TOKEN', id_tenant);
        
        if (!refreshToken) {
            throw new Error("Refresh Token não encontrado no banco de dados.");
        }

        // 2. Faz a chamada ao Mercado Pago pedindo a renovação
        const response = await axios.post('https://api.mercadopago.com/oauth/token', {
            client_id: process.env.MP_MASTER_CLIENT_ID,
            client_secret: process.env.MP_MASTER_CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: refreshToken.trim()
        }, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const { access_token, public_key, refresh_token: novo_refresh_token } = response.data;

        // 3. Salva os novos dados no banco (inclusive o NOVO refresh_token, pois ele também muda!)
        await ConfiguracaoModel.set('MERCADOPAGO_ACCESS_TOKEN', access_token, id_tenant);
        await ConfiguracaoModel.set('MERCADOPAGO_PUBLIC_KEY', public_key, id_tenant);
        await ConfiguracaoModel.set('MERCADOPAGO_REFRESH_TOKEN', novo_refresh_token, id_tenant);

        console.log(`✅ [REFRESH MP] Tokens renovados com sucesso para o Tenant ${id_tenant}!`);
        return true;

    } catch (error) {
        console.error(`❌ Erro ao renovar token do Tenant ${id_tenant}:`, error.response?.data || error.message);
        return false;
    }
};

export const handleMercadoLivreOAuthCallback = async (req, res) => {
    // O ML envia o 'code' na URL, e o 'state' traz o id_tenant (igual ao MP)
    const { code, state: id_tenant } = req.query;

    if (!code || !id_tenant) {
        return res.status(400).send("Código de autorização ou Tenant ID ausente.");
    }

    try {
        console.log(`🔄 [OAUTH ML] Trocando código por credenciais para o Tenant ${id_tenant}...`);

        // Faz a requisição para a API do Mercado Livre para trocar o código pelo Token
        const response = await axios.post('https://api.mercadolibre.com/oauth/token', {
            grant_type: 'authorization_code',
            client_id: process.env.MERCADO_LIVRE_APP_ID,
            client_secret: process.env.MERCADO_LIVRE_SECRET_KEY,
            code: code,
            // ⚠️ ATENÇÃO: Esta string tem que ser IDÊNTICA ao que você vai cadastrar no painel do ML
            redirect_uri: "https://back.ararinhacloud.shop/api/webhooks/mercadolivre/callback"
        }, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            }
        });

        // O ML devolve o token de acesso, o refresh token e o ID do usuário no ML
        const { access_token, refresh_token, user_id } = response.data;

        // Salva as credenciais da loja no banco de dados
        await ConfiguracaoModel.set('MERCADO_LIVRE_ACCESS_TOKEN', access_token, Number(id_tenant));
        await ConfiguracaoModel.set('MERCADO_LIVRE_REFRESH_TOKEN', refresh_token, Number(id_tenant)); 
        await ConfiguracaoModel.set('MERCADO_LIVRE_USER_ID', String(user_id), Number(id_tenant)); 

        console.log(`✅ [OAUTH ML] Credenciais salvas com sucesso para o Tenant ${id_tenant}.`);

        // Redireciona de volta para o painel
        res.redirect(`https://admin.ararinhacloud.shop/admin/configuracoes?ml=success`);

    } catch (error) {
        console.error("❌ Erro no OAuth ML:", error.response?.data || error.message);
        res.redirect(`https://admin.ararinhacloud.shop/admin/configuracoes?ml=error`);
    }
};

export const handleStripeOAuthCallback = async (req, res) => {
    // O Stripe envia o 'code' na URL, e o 'state' traz o id_tenant (igual aos outros)
    const { code, state: id_tenant } = req.query;

    if (!code || !id_tenant) {
        return res.status(400).send("Código de autorização ou Tenant ID ausente.");
    }

    try {
        console.log(`🔄 [OAUTH STRIPE] Trocando código por credenciais para o Tenant ${id_tenant}...`);

        // Faz a requisição para a API do Stripe para trocar o código pelas chaves
        // ATENÇÃO: O Stripe usa a Chave Secreta MESTRA da sua plataforma para validar o pedido
        const response = await axios.post('https://connect.stripe.com/oauth/token', {
            grant_type: 'authorization_code',
            client_secret: process.env.STRIPE_MASTER_SECRET_KEY, // A chave secreta do seu painel Stripe Mestre
            code: code
        });

        // O Stripe devolve a chave pública, a chave secreta (access_token) e o ID da conta conectada
        const { stripe_publishable_key, access_token, stripe_user_id } = response.data;

        // Salva as credenciais da loja no banco de dados
        await ConfiguracaoModel.set('STRIPE_PUBLIC_KEY', stripe_publishable_key, Number(id_tenant));
        await ConfiguracaoModel.set('STRIPE_SECRET_KEY', access_token, Number(id_tenant)); 
        await ConfiguracaoModel.set('STRIPE_ACCOUNT_ID', stripe_user_id, Number(id_tenant)); 

        console.log(`✅ [OAUTH STRIPE] Credenciais salvas com sucesso para o Tenant ${id_tenant}.`);

        // Redireciona de volta para o painel de gateways
        res.redirect(`https://admin.ararinhacloud.shop/admin/gateway-config?stripe=success`);

    } catch (error) {
        console.error("❌ Erro no OAuth Stripe:", error.response?.data || error.message);
        res.redirect(`https://admin.ararinhacloud.shop/admin/gateway-config?stripe=error`);
    }
};