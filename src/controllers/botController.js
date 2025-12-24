import { handleAbandonedCarts, handlePendingPayments } from '../services/botService.js';
import { sendTestEmail } from '../services/emailService.js';

// @desc    Dispara manualmente a verificação de carrinhos abandonados
export const testAbandonedCarts = async (req, res, next) => {
    try {
        await handleAbandonedCarts(); // Chama a função diretamente
        res.json({ message: 'Verificação de carrinhos abandonados executada com sucesso. Verifique o console e os e-mails.' });
    } catch (error) {
        next(error);
    }
};

// @desc    Dispara manualmente a verificação de pagamentos pendentes
export const testPendingPayments = async (req, res, next) => {
    try {
        await handlePendingPayments(); // Chama a função diretamente
        res.json({ message: 'Verificação de pagamentos pendentes executada com sucesso. Verifique o console e os e-mails.' });
    } catch (error) {
        next(error);
    }
};

// @desc    Dispara manualmente o envio de um e-mail de teste
export const testEmailSending = async (req, res, next) => {
    try {
        const { to } = req.query; // Pega o email da URL
        if (!to) {
            return res.status(400).json({ message: "Por favor, forneça um e-mail de destino na URL (ex: /test-email?to=seuemail@example.com)." });
        }
        await sendTestEmail(to);
        res.json({ message: `Tentativa de envio de e-mail de teste para ${to}. Verifique a caixa de entrada e o console do servidor.` });
    } catch (error) {
        next(error);
    }
};

