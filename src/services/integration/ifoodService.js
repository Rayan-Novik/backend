import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const IFOOD_API_URL = 'https://merchant-api.ifood.com.br';

// 🚀 SERVIÇO 1: Garantir que temos um token válido (AGORA 100% AUTOMÁTICO)
export const getValidIfoodToken = async (tenantId) => {
    const authData = await prisma.ifoodAuth.findFirst({
        where: { id_tenant: tenantId }
    });

    if (!authData) {
        throw new Error('Loja não está integrada ao iFood.');
    }

    const agora = new Date();

    // Retorna o token atual se ainda estiver válido (Damos 1 minuto de margem de segurança)
    if (authData.expiresIn > new Date(agora.getTime() + 60000)) {
        return authData.accessToken;
    }

    // 🟢 A MÁGICA ACONTECE AQUI: O TOKEN EXPIROU? O BACKEND GERA OUTRO SOZINHO!
    try {
        const params = new URLSearchParams();
        // Usamos as credenciais salvas no banco para gerar um token fresco!
        params.append('grantType', 'client_credentials'); 
        params.append('clientId', authData.clientId);
        params.append('clientSecret', authData.clientSecret);

        const response = await axios.post(`${IFOOD_API_URL}/authentication/v1.0/oauth/token`, params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const { accessToken, expiresIn } = response.data;
        const novaExpiracao = new Date(agora.getTime() + expiresIn * 1000);

        // Atualiza o banco com o novo token válido
        await prisma.ifoodAuth.update({
            where: { id: authData.id },
            data: { accessToken, expiresIn: novaExpiracao, updatedAt: new Date() }
        });

        console.log(`✅ Token renovado silenciosamente para o Tenant ${tenantId}`);
        return accessToken;

    } catch (error) {
        console.error(`❌ Erro crítico ao renovar token (Tenant ${tenantId}):`, error.response?.data || error.message);
        throw new Error('As credenciais do iFood são inválidas ou foram revogadas lá no portal do iFood.');
    }
};

// 🚀 SERVIÇO 2: Buscar o Catálogo Principal da Loja
export const getMerchantCatalog = async (tenantId) => {
    // 🟢 Ao chamar essa função, ele já checa e renova o token sozinho se precisar
    const token = await getValidIfoodToken(tenantId);
    const authData = await prisma.ifoodAuth.findFirst({ where: { id_tenant: tenantId } });

    try {
        const { data } = await axios.get(
            `${IFOOD_API_URL}/catalog/v1.0/merchants/${authData.merchantId}/catalogs`,
            { headers: { Authorization: `Bearer ${token}` } }
        );

        if (data && data.length > 0) {
            return { catalogId: data[0].catalogId, merchantId: authData.merchantId, token };
        }
        throw new Error("Nenhum catálogo encontrado no iFood para esta loja.");
    } catch (error) {
        console.error("❌ Erro ao buscar catálogo:", error.response?.data || error.message);
        throw new Error("Falha ao comunicar com o Catálogo do iFood.");
    }
};

// 🟢 VERIFICA SE JÁ ESTÁ CONECTADO (Usado ao abrir a tela)
export const checkAuthStatus = async (req, res, next) => {
    try {
        const authData = await prisma.ifoodAuth.findFirst({
            where: { id_tenant: req.tenantId }
        });
        
        if (authData) {
            return res.status(200).json({ connected: true, merchantId: authData.merchantId });
        }
        return res.status(200).json({ connected: false });
    } catch (error) {
        next(error);
    }
};

// 🟢 CONECTA E GERA O PRIMEIRO TOKEN (O Lojista só faz isso 1x na vida)
export const connectIfood = async (req, res, next) => {
    try {
        const { clientId, clientSecret, merchantId } = req.body;
        const tenantId = req.tenantId;

        if (!clientId || !clientSecret || !merchantId) {
            return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
        }

        const response = await axios.post(`${IFOOD_API_URL}/authentication/v1.0/oauth/token`, {
            grantType: 'client_credentials',
            clientId: clientId,
            clientSecret: clientSecret
        }, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const { accessToken, expiresIn } = response.data;
        const tempoExpiracao = expiresIn || 3600;
        const novaExpiracao = new Date(Date.now() + tempoExpiracao * 1000);

        await prisma.ifoodAuth.upsert({
            where: { merchantId: merchantId },
            update: {
                id_tenant: tenantId,
                clientId: clientId,
                clientSecret: clientSecret,
                accessToken: accessToken,
                expiresIn: novaExpiracao,
                updatedAt: new Date()
            },
            create: {
                id_tenant: tenantId,
                merchantId: merchantId,
                clientId: clientId,
                clientSecret: clientSecret,
                accessToken: accessToken,
                expiresIn: novaExpiracao
            }
        });

        res.status(200).json({ message: 'iFood conectado com sucesso!', connected: true });

    } catch (error) {
        console.error("❌ Erro ao autenticar no iFood:", error.response?.data || error.message);
        res.status(400).json({ 
            message: 'Credenciais inválidas. Verifique os dados no portal do iFood.',
            details: error.response?.data 
        });
    }
};

// 🟢 DESCONECTA A LOJA (Remove as credenciais do banco)
export const disconnectIfood = async (req, res, next) => {
    try {
        await prisma.ifoodAuth.deleteMany({
            where: { id_tenant: req.tenantId }
        });
        res.status(200).json({ message: 'Integração removida com sucesso.' });
    } catch (error) {
        next(error);
    }
};

export const syncProduct = async (req, res, next) => {
    try {
        const productId = Number(req.params.id);
        
        const result = await ifoodService.syncProductToIfood(productId, req.tenantId);
        
        res.status(200).json({ 
            message: 'Produto sincronizado com sucesso no iFood!', 
            details: result 
        });
    } catch (error) {
        next(error);
    }
};