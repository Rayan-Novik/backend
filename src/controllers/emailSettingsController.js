import nodemailer from 'nodemailer';
import ConfiguracaoModel from '../models/configuracaoModel.js';
// ✅ IMPORTANTE: Importando as funções de serviço (Certifique-se que o emailService.js está atualizado)
import { sendRichTestEmail, sendTestScenario } from '../services/emailService.js';

/**
 * @desc    Obtém as configurações atuais de SMTP
 * @route   GET /api/config/email
 */
export const getEmailConfig = async (req, res, next) => {
    try {
        const config = {
            SMTP_HOST: await ConfiguracaoModel.get('SMTP_HOST'),
            SMTP_PORT: await ConfiguracaoModel.get('SMTP_PORT'),
            SMTP_USER: await ConfiguracaoModel.get('SMTP_USER'),
            SMTP_SECURE: await ConfiguracaoModel.get('SMTP_SECURE'),
            SMTP_FROM_NAME: await ConfiguracaoModel.get('SMTP_FROM_NAME'),
            SMTP_FROM_EMAIL: await ConfiguracaoModel.get('SMTP_FROM_EMAIL'),
            SMTP_SIGNATURE: await ConfiguracaoModel.get('SMTP_SIGNATURE'), 
            SMTP_SIGNATURE_IMAGE: await ConfiguracaoModel.get('SMTP_SIGNATURE_IMAGE'), // ✅ NOVO: Retorna a imagem da assinatura
        };
        res.json(config);
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Testa a conexão com o servidor SMTP e envia um E-mail Visual
 * @route   POST /api/config/email/test
 */
export const testEmailConnection = async (req, res, next) => {
    const { host, port, user, pass, secure } = req.body;

    try {
        // 1. Cria um transporte temporário com os dados DO FORMULÁRIO
        const transporter = nodemailer.createTransport({
            host: host,
            port: Number(port),
            secure: secure === true || secure === 'true',
            auth: {
                user: user,
                pass: pass
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        // 2. Tenta logar no servidor SMTP
        await transporter.verify();

        // 3. Se logou, tenta enviar o e-mail visual completo (Rich Text)
        try {
             await sendRichTestEmail(transporter, user, user); // Envia DE: user PARA: user
             res.json({ success: true, message: 'Conexão Aceita! Um e-mail de teste visual foi enviado para ' + user });
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
            message: 'Falha na conexão: ' + (error.response || error.message) 
        });
    }
};

/**
 * @desc    Salva as configurações de SMTP
 * @route   PUT /api/config/email
 */
export const updateEmailConfig = async (req, res, next) => {
    try {
        const { 
            SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, 
            SMTP_SECURE, SMTP_FROM_NAME, SMTP_FROM_EMAIL,
            SMTP_SIGNATURE, 
            SMTP_SIGNATURE_IMAGE // ✅ NOVO: Recebe a URL da imagem
        } = req.body;

        await ConfiguracaoModel.set('SMTP_HOST', SMTP_HOST);
        await ConfiguracaoModel.set('SMTP_PORT', String(SMTP_PORT));
        await ConfiguracaoModel.set('SMTP_USER', SMTP_USER);
        await ConfiguracaoModel.set('SMTP_SECURE', String(SMTP_SECURE));
        await ConfiguracaoModel.set('SMTP_FROM_NAME', SMTP_FROM_NAME);
        await ConfiguracaoModel.set('SMTP_FROM_EMAIL', SMTP_FROM_EMAIL);
        await ConfiguracaoModel.set('SMTP_SIGNATURE', SMTP_SIGNATURE || ''); 
        await ConfiguracaoModel.set('SMTP_SIGNATURE_IMAGE', SMTP_SIGNATURE_IMAGE || ''); // ✅ NOVO: Salva no banco

        if (SMTP_PASS && SMTP_PASS.trim() !== '') {
            await ConfiguracaoModel.set('SMTP_PASS', SMTP_PASS);
        }

        res.json({ message: 'Configurações de E-mail atualizadas com sucesso!' });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Obtém uma configuração específica pela chave (ex: LOGO_URL)
 * @route   GET /api/config/public/:key
 */
export const getConfigByKey = async (req, res, next) => {
    try {
        const { key } = req.params;
        const valor = await ConfiguracaoModel.get(key);
        res.json({ valor });
    } catch (error) {
        next(error);
    }
};

/**
 * @desc    Dispara um cenário de teste específico (Laboratório de Testes)
 * @route   POST /api/config/email/test-scenario
 */
export const triggerTestScenario = async (req, res, next) => {
    const { type, email } = req.body;
    
    try {
        // Chama a função importada do emailService.js
        await sendTestScenario(type, email);
        res.json({ success: true, message: `E-mail de teste (${type}) enviado com sucesso!` });
    } catch (error) {
        console.error("Erro no teste de cenário:", error);
        res.status(500).json({ success: false, message: 'Erro ao enviar teste: ' + error.message });
    }
};