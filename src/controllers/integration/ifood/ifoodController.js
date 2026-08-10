import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const IFOOD_API_URL = 'https://merchant-api.ifood.com.br';

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

// 🟢 CONECTA E GERA O PRIMEIRO TOKEN (Usado ao enviar o form)
export const connectIfood = async (req, res, next) => {
    try {
        const { clientId, clientSecret, merchantId } = req.body;
        const tenantId = req.tenantId; // 🔒 BLINDAGEM SAAS

        if (!clientId || !clientSecret || !merchantId) {
            return res.status(400).json({ message: 'Todos os campos são obrigatórios.' });
        }

        // 1. Vai no iFood validar as credenciais e pegar o Token
        const response = await axios.post(`${IFOOD_API_URL}/authentication/v1.0/oauth/token`, {
            grantType: 'client_credentials',
            clientId: clientId,
            clientSecret: clientSecret
        }, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const { accessToken, refreshToken, expiresIn } = response.data;
        
        // iFood retorna tempo de expiração em segundos (geralmente 3600 = 1 hora)
        const tempoExpiracao = expiresIn || 3600;
        const novaExpiracao = new Date(Date.now() + tempoExpiracao * 1000);

        // 2. Salva ou atualiza os dados no banco usando Upsert
        // Como 'merchantId' é @unique no seu schema, usamos ele como chave de busca
        await prisma.ifoodAuth.upsert({
            where: { merchantId: merchantId },
            update: {
                id_tenant: tenantId,
                clientId: clientId,
                clientSecret: clientSecret,
                accessToken: accessToken,
                refreshToken: refreshToken || '',
                expiresIn: novaExpiracao,
                updatedAt: new Date()
            },
            create: {
                id_tenant: tenantId,
                merchantId: merchantId,
                clientId: clientId,
                clientSecret: clientSecret,
                accessToken: accessToken,
                refreshToken: refreshToken || '',
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
            where: { id_tenant: req.tenantId } // 🔒 Apaga apenas os dados deste lojista
        });
        res.status(200).json({ message: 'Integração removida com sucesso.' });
    } catch (error) {
        next(error);
    }
};

export const syncProduct = async (req, res, next) => {
    try {
        const productId = Number(req.params.id);
        
        // Chama o serviço que acabamos de criar
        const result = await ifoodService.syncProductToIfood(productId, req.tenantId);
        
        res.status(200).json({ 
            message: 'Produto sincronizado com sucesso no iFood!', 
            details: result 
        });
    } catch (error) {
        next(error);
    }
};