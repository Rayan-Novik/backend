import nodemailer from 'nodemailer';
import ConfiguracaoModel from '../models/configuracaoModel.js';
import { sendRichTestEmail, sendTestScenario } from '../services/emailService.js';

export const getEmailConfig = async (req, res, next) => {
    try {
        const config = {
            SMTP_HOST: await ConfiguracaoModel.get('SMTP_HOST', req.tenantId),
            SMTP_PORT: await ConfiguracaoModel.get('SMTP_PORT', req.tenantId),
            SMTP_USER: await ConfiguracaoModel.get('SMTP_USER', req.tenantId),
            SMTP_SECURE: await ConfiguracaoModel.get('SMTP_SECURE', req.tenantId),
            SMTP_FROM_NAME: await ConfiguracaoModel.get('SMTP_FROM_NAME', req.tenantId),
            SMTP_FROM_EMAIL: await ConfiguracaoModel.get('SMTP_FROM_EMAIL', req.tenantId),
            SMTP_SIGNATURE: await ConfiguracaoModel.get('SMTP_SIGNATURE', req.tenantId), 
            SMTP_SIGNATURE_IMAGE: await ConfiguracaoModel.get('SMTP_SIGNATURE_IMAGE', req.tenantId), 
        };
        res.json(config);
    } catch (error) {
        next(error);
    }
};

export const testEmailConnection = async (req, res, next) => {
    // 🟢 CORREÇÃO: Lendo as variáveis com o nome exato que o Frontend envia
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = req.body;

    try {
        const transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: Number(SMTP_PORT),
            secure: SMTP_SECURE === true || SMTP_SECURE === 'true',
            auth: {
                user: SMTP_USER,
                pass: SMTP_PASS
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        await transporter.verify();

        try {
             await sendRichTestEmail(transporter, SMTP_USER, SMTP_USER, req.tenantId); 
             res.json({ success: true, message: 'Conexão Aceita! Um e-mail de teste visual foi enviado para ' + SMTP_USER });
        } catch (sendError) {
             console.error("Erro ao enviar e-mail de teste visual:", sendError);
             res.status(200).json({ 
                 success: true, 
                 message: 'Login SMTP OK, mas houve erro ao enviar o e-mail: ' + sendError.message 
             });
        }

    } catch (error) {
        console.error('Erro no teste SMTP:', error);
        res.status(400).json({ 
            success: false, 
            message: 'Falha na conexão: ' + (error.message) 
        });
    }
};

// 🟢 CORREÇÃO: Usando Promise.all com valores default seguros para evitar null no Prisma
export const updateEmailConfig = async (req, res, next) => {
    try {
        const { 
            SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, 
            SMTP_SECURE, SMTP_FROM_NAME, SMTP_FROM_EMAIL,
            SMTP_SIGNATURE, SMTP_SIGNATURE_IMAGE 
        } = req.body;

        const id_tenant = req.tenantId;

        const updates = [
            ConfiguracaoModel.set('SMTP_HOST', SMTP_HOST || '', id_tenant),
            ConfiguracaoModel.set('SMTP_PORT', SMTP_PORT || '', id_tenant),
            ConfiguracaoModel.set('SMTP_USER', SMTP_USER || '', id_tenant),
            ConfiguracaoModel.set('SMTP_SECURE', SMTP_SECURE || 'false', id_tenant),
            ConfiguracaoModel.set('SMTP_FROM_NAME', SMTP_FROM_NAME || '', id_tenant),
            ConfiguracaoModel.set('SMTP_FROM_EMAIL', SMTP_FROM_EMAIL || '', id_tenant),
            ConfiguracaoModel.set('SMTP_SIGNATURE', SMTP_SIGNATURE || '', id_tenant),
            ConfiguracaoModel.set('SMTP_SIGNATURE_IMAGE', SMTP_SIGNATURE_IMAGE || '', id_tenant)
        ];

        // Salva a senha apenas se o usuário digitou algo
        if (SMTP_PASS && String(SMTP_PASS).trim() !== '') {
            updates.push(ConfiguracaoModel.set('SMTP_PASS', String(SMTP_PASS).trim(), id_tenant));
        }

        // Executa todos os inserts/updates de uma vez de forma segura
        await Promise.all(updates);

        res.json({ message: 'Configurações de E-mail atualizadas com sucesso!' });
    } catch (error) {
        next(error);
    }
};

export const getConfigByKey = async (req, res, next) => {
    try {
        const { key } = req.params;
        const valor = await ConfiguracaoModel.get(key, req.tenantId);
        res.json({ valor });
    } catch (error) {
        next(error);
    }
};

export const triggerTestScenario = async (req, res, next) => {
    const { type, email } = req.body;
    
    try {
        await sendTestScenario(type, email, req.tenantId);
        res.json({ success: true, message: `E-mail de teste (${type}) enviado com sucesso!` });
    } catch (error) {
        console.error("Erro no teste de cenário:", error);
        res.status(500).json({ success: false, message: 'Erro ao enviar teste: ' + error.message });
    }
};