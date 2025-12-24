import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Configuração do "carteiro" que vai enviar os e-mails
// Use um serviço como Mailgun, SendGrid ou até mesmo o Gmail (para testes)
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_PORT == 465, // true para porta 465, false para outras
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

/**
 * Função genérica para enviar um e-mail.
 */
const sendEmail = async ({ to, subject, html }) => {
    try {
        await transporter.sendMail({
            from: `"Sua Loja" <${process.env.EMAIL_FROM}>`,
            to: to,
            subject: subject,
            html: html,
        });
        console.log(`✉️ Email enviado para ${to}`);
    } catch (error) {
        console.error(`❌ Erro ao enviar email para ${to}:`, error);
    }
};

/**
 * Envia um e-mail de lembrete de carrinho abandonado.
 */
export const sendAbandonedCartEmail = async (user, items) => {
    const subject = `Olá ${user.nome_completo.split(' ')[0]}, você esqueceu alguns itens no seu carrinho!`;
    
    const itemsHtml = items.map(item => `
        <div style="border-bottom: 1px solid #eee; padding: 10px 0; display: flex; align-items: center;">
            <img src="${item.imagens[0]?.url || 'https://placehold.co/60'}" alt="${item.nome}" style="width: 60px; height: 60px; margin-right: 15px;">
            <div>
                <strong>${item.nome}</strong><br>
                <span>R$ ${parseFloat(item.preco).toFixed(2)}</span>
            </div>
        </div>
    `).join('');

    const html = `
        <h1>Quase lá!</h1>
        <p>Percebemos que você deixou alguns produtos incríveis no seu carrinho. Não perca a chance de finalizar sua compra!</p>
        ${itemsHtml}
        <br>
        <a href="${process.env.FRONTEND_URL}/carrinho" style="background-color: #007bff; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block;">Finalizar Compra</a>
        <p>Se precisar de ajuda, é só chamar!</p>
    `;

    await sendEmail({ to: user.email, subject, html });
};

/**
 * Envia um e-mail de lembrete de pagamento pendente.
 */
export const sendPendingPaymentEmail = async (user, order) => {
    const subject = `Lembrete: Pagamento do seu pedido #${order.id_pedido} está pendente`;
    
    const html = `
        <h1>Pagamento Pendente</h1>
        <p>Olá ${user.nome_completo.split(' ')[0]},</p>
        <p>Vimos que o seu pedido de número <strong>#${order.id_pedido}</strong> ainda está com o pagamento pendente. Não se esqueça de finalizá-lo para que possamos preparar o seu envio!</p>
        <a href="${process.env.FRONTEND_URL}/meuspedidos/${order.id_pedido}" style="background-color: #ffc107; color: black; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block;">Ver Pedido e Pagar</a>
        <p>Caso já tenha efetuado o pagamento, por favor, desconsidere este e-mail.</p>
    `;

    await sendEmail({ to: user.email, subject, html });
};

export const sendTestEmail = async (recipientEmail) => {
    console.log(`🤖 Preparando e-mail de teste para ${recipientEmail}...`);
    
    const mailOptions = {
        from: `Sua Loja <${process.env.EMAIL_FROM}>`,
        to: recipientEmail,
        subject: '✅ Teste de Envio de E-mail da Sua Loja',
        html: `
            <div style="font-family: sans-serif; padding: 20px; color: #333;">
                <h2>Olá!</h2>
                <p>Se você recebeu esta mensagem, significa que o seu serviço de envio de e-mails está <strong>configurado e funcionando corretamente!</strong></p>
                <p>Parabéns!</p>
            </div>
        `,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`✉️ E-mail de teste enviado com sucesso para ${recipientEmail}`);
    } catch (error) {
        console.error(`❌ Falha ao enviar e-mail de teste para ${recipientEmail}:`, error);
        throw new Error('Falha ao enviar e-mail de teste.');
    }
};

export const sendPasswordResetEmail = async (email, nome, resetUrl) => {
    const subject = 'Redefinição de Senha da Sua Loja';
    const html = `
        <h1>Pedido de Redefinição de Senha</h1>
        <p>Olá ${nome.split(' ')[0]},</p>
        <p>Você solicitou a redefinição da sua senha. Clique no link abaixo para criar uma nova senha:</p>
        <a href="${resetUrl}" style="background-color: #dc3545; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; display: inline-block;">Redefinir Senha</a>
        <p>Este link é válido por 1 hora. Se você não solicitou esta alteração, por favor, ignore este e-mail.</p>
    `;

    await sendEmail({ to: email, subject, html });
};