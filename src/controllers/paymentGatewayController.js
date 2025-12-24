import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Lista de chaves de configuração que este módulo irá gerir
const GATEWAY_KEYS = [
    'MERCADOPAGO_ACCESS_TOKEN',
    'MERCADOPAGO_PUBLIC_KEY'
];

/**
 * @desc    Obter todas as configurações de gateways de pagamento
 * @route   GET /api/payment-gateways
 * @access  Private/Admin
 */
export const getPaymentGatewaySettings = async (req, res, next) => {
    try {
        const settings = await prisma.configuracoes.findMany({
            where: { chave: { in: GATEWAY_KEYS } }
        });

        // Transforma a lista num objeto para o frontend
        const settingsMap = settings.reduce((acc, setting) => {
            acc[setting.chave] = setting.valor;
            return acc;
        }, {});

        res.json(settingsMap);
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Atualizar as configurações de gateways de pagamento
 * @route   PUT /api/payment-gateways
 * @access  Private/Admin
 */
export const updatePaymentGatewaySettings = async (req, res, next) => {
    try {
        const newSettings = req.body;
        const updatePromises = GATEWAY_KEYS.map(key => {
            if (newSettings[key] !== undefined) {
                const value = String(newSettings[key]);
                return prisma.configuracoes.upsert({
                    where: { chave: key },
                    update: { valor: value },
                    create: { chave: key, valor: value },
                });
            }
            return Promise.resolve();
        });
        await Promise.all(updatePromises);
        res.json({ message: 'Configurações de pagamento atualizadas com sucesso!' });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Obter apenas a Public Key do Mercado Pago (para o frontend)
 * @route   GET /api/payment-gateways/mercadopago-public-key
 * @access  Public
 */
export const getMercadoPagoPublicKey = async (req, res, next) => {
    try {
        const publicKeySetting = await prisma.configuracoes.findUnique({
            where: { chave: 'MERCADOPAGO_PUBLIC_KEY' }
        });

        if (publicKeySetting && publicKeySetting.valor) {
            res.json({ publicKey: publicKeySetting.valor });
        } else {
            // É importante não retornar um erro 404 para não quebrar o frontend.
            // Apenas enviamos um valor nulo, e o frontend saberá como lidar com isso.
            res.json({ publicKey: null });
        }
    } catch (error) {
        next(error);
    }
};