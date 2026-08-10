import { handleAbandonedCarts, handlePendingPayments } from '../services/botService.js';
import { sendTestEmail } from '../services/emailService.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getBotConfig = async (req, res, next) => {
    try {
        const configs = await prisma.configuracoes.findMany({
            where: {
                chave: { in: ['bot_active', 'bot_prompt', 'bot_model', 'bot_temperature'] },
                id_tenant: req.tenantId // 🛡️ BLINDAGEM SAAS
            }
        });

        const configMap = configs.reduce((acc, curr) => {
            acc[curr.chave] = curr.valor;
            return acc;
        }, {});

        res.json({
            active: configMap.bot_active === 'true', 
            prompt: configMap.bot_prompt || "Você é um vendedor útil.",
            model: configMap.bot_model || "llama-3.3-70b-versatile",
            temperature: parseFloat(configMap.bot_temperature || '0.7')
        });
    } catch (error) {
        next(error);
    }
};

export const updateBotConfig = async (req, res, next) => {
    console.log(`📥 Recebendo config para salvar (Loja ${req.tenantId}):`, req.body);

    const { active, prompt, model, temperature } = req.body;

    try {
        if (temperature === undefined || !model) {
            throw new Error("Dados incompletos: Faltando model ou temperature.");
        }

        const upsertConfig = async (chave, valor) => {
            const valorString = String(valor);
            
            const existing = await prisma.configuracoes.findFirst({
                where: { chave: chave, id_tenant: req.tenantId }
            });

            if (existing) {
                await prisma.configuracoes.updateMany({
                    where: { chave: chave, id_tenant: req.tenantId },
                    data: { valor: valorString }
                });
            } else {
                await prisma.configuracoes.create({
                    data: { 
                        chave: chave, 
                        valor: valorString,
                        id_tenant: req.tenantId 
                    }
                });
            }
        };

        await upsertConfig('bot_active', active);
        await upsertConfig('bot_prompt', prompt || "");
        await upsertConfig('bot_model', model);
        await upsertConfig('bot_temperature', temperature);

        console.log("✅ Configurações salvas com sucesso no banco!");
        res.json({ message: "Configurações salvas com sucesso!" });

    } catch (error) {
        console.error("❌ ERRO AO SALVAR NO BANCO:", error);
        res.status(500).json({ 
            message: "Erro interno ao salvar configurações", 
            error: error.message 
        });
    }
};

export const testAbandonedCarts = async (req, res, next) => {
    try {
        await handleAbandonedCarts(req.tenantId); 
        res.json({ message: 'Verificação de carrinhos abandonados executada com sucesso.' });
    } catch (error) {
        next(error);
    }
};

export const testPendingPayments = async (req, res, next) => {
    try {
        await handlePendingPayments(req.tenantId); 
        res.json({ message: 'Verificação de pagamentos pendentes executada com sucesso.' });
    } catch (error) {
        next(error);
    }
};

export const testEmailSending = async (req, res, next) => {
    try {
        const { to } = req.query; 
        if (!to) {
            return res.status(400).json({ message: "Por favor, forneça um e-mail de destino na URL." });
        }
        await sendTestEmail(to, req.tenantId);
        res.json({ message: `Tentativa de envio de e-mail de teste para ${to}.` });
    } catch (error) {
        next(error);
    }
};