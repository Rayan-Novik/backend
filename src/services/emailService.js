import nodemailer from 'nodemailer';
import ConfiguracaoModel from '../models/configuracaoModel.js';
import dotenv from 'dotenv';

dotenv.config();

// ==============================================================================
// 1. HELPERS (Funções Auxiliares)
// ==============================================================================

// Formata valores monetários para BRL
const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

// Resolve a imagem do produto (Capa > Subimagem > Placeholder)
const getProductImage = (item) => {
    if (item.imagem_url) return item.imagem_url;
    if (item.produto_subimagens && item.produto_subimagens.length > 0) {
        return item.produto_subimagens[0].url;
    }
    return 'https://placehold.co/100x100?text=Sem+Foto'; 
};

// Resolve a URL absoluta da Logo
const getLogoUrl = async () => {
    let logoPath = await ConfiguracaoModel.get('LOGO_URL');
    if (!logoPath) return null;
    if (logoPath.startsWith('http')) return logoPath;
    const backendUrl = process.env.BACKEND_URL || 'https://back.ecommercerpool.shop'; 
    return `${backendUrl}${logoPath.startsWith('/') ? '' : '/'}${logoPath}`;
};

// Template Base de HTML (Com Logo e Assinatura)
const getEmailTemplate = async (title, bodyContent, actionButton = null) => {
    const primaryColor = '#0d6efd'; 
    const logoUrl = await getLogoUrl(); 
    const siteTitle = await ConfiguracaoModel.get('SITE_TITLE') || 'Loja Virtual';
    
    // Busca assinatura
    const signature = await ConfiguracaoModel.get('SMTP_SIGNATURE') || '';
    const signatureImg = await ConfiguracaoModel.get('SMTP_SIGNATURE_IMAGE') || '';

    // Converte quebras de linha em <br>
    const formattedSignature = (signature && signature.includes('<')) 
    ? signature 
    : (signature ? signature.replace(/\n/g, '<br>') : '');

    const headerContent = logoUrl 
        ? `<img src="${logoUrl}" alt="${siteTitle}" style="max-height: 60px; max-width: 200px; display: block; margin: 0 auto;">`
        : `<h1 style="color: ${primaryColor}; margin: 0; font-size: 24px;">${siteTitle}</h1>`;

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f6f9; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
            .header { background-color: #ffffff; padding: 30px 20px; text-align: center; border-bottom: 3px solid ${primaryColor}; }
            .content { padding: 40px 30px; color: #333333; line-height: 1.6; }
            .content h2 { margin-top: 0; color: #333; font-size: 20px; text-align: center; margin-bottom: 20px;}
            .product-list { margin-top: 20px; border: 1px solid #eeeeee; border-radius: 8px; overflow: hidden; }
            .product-item { display: flex; align-items: center; padding: 15px; border-bottom: 1px solid #eeeeee; }
            .product-item:last-child { border-bottom: none; }
            .product-img { width: 60px; height: 60px; object-fit: cover; border-radius: 6px; margin-right: 15px; background: #f8f9fa; }
            .btn { display: inline-block; background-color: ${primaryColor}; color: #ffffff; text-decoration: none; padding: 14px 30px; border-radius: 50px; font-weight: bold; margin-top: 25px; text-align: center; }
            
            /* Estilos da Assinatura Melhorados */
            .signature-box { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eeeeee; font-size: 14px; color: #666; }
            .signature-text { margin-bottom: 15px; }
            .signature-img { display: block; max-width: 200px; max-height: 100px; width: auto; height: auto; border: 0; }
            
            .footer { background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #999999; border-top: 1px solid #eeeeee; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">${headerContent}</div>
            <div class="content">
                <h2>${title}</h2>
                ${bodyContent}
                
                ${actionButton ? `<div style="text-align: center;">${actionButton}</div>` : ''}

                ${(formattedSignature || signatureImg) ? `
                    <div class="signature-box">
                        ${formattedSignature ? `<div class="signature-text">${formattedSignature}</div>` : ''}
                        ${signatureImg ? `<div><img src="${signatureImg}" alt="Assinatura" class="signature-img"></div>` : ''}
                    </div>
                ` : ''}
            </div>
            <div class="footer">
                <p>Este é um e-mail automático enviado por <strong>${siteTitle}</strong>.</p>
                <p>&copy; ${new Date().getFullYear()} Todos os direitos reservados.</p>
            </div>
        </div>
    </body>
    </html>
    `;
};

// ==============================================================================
// 2. TRANSPORTE (Configuração do Nodemailer)
// ==============================================================================

const getTransporter = async () => {
    const config = {
        host: await ConfiguracaoModel.get('SMTP_HOST'),
        port: await ConfiguracaoModel.get('SMTP_PORT'),
        user: await ConfiguracaoModel.get('SMTP_USER'),
        pass: await ConfiguracaoModel.get('SMTP_PASS'),
        secure: await ConfiguracaoModel.get('SMTP_SECURE'),
    };

    if (!config.host || !config.user || !config.pass) {
        console.warn('⚠️ SMTP incompleto no banco de dados. O envio falhará.');
        return null;
    }

    return nodemailer.createTransport({
        host: config.host,
        port: Number(config.port),
        secure: config.secure === 'true', 
        auth: { user: config.user, pass: config.pass },
        tls: { rejectUnauthorized: false }
    });
};

const sendEmail = async ({ to, subject, html }) => {
    try {
        const transporter = await getTransporter();
        if (!transporter) throw new Error('Configuração SMTP inválida.');

        const fromName = await ConfiguracaoModel.get('SMTP_FROM_NAME') || 'Loja Virtual';
        const fromEmail = await ConfiguracaoModel.get('SMTP_FROM_EMAIL') || await ConfiguracaoModel.get('SMTP_USER');

        const info = await transporter.sendMail({
            from: `"${fromName}" <${fromEmail}>`,
            to,
            subject,
            html,
        });

        console.log(`✅ E-mail enviado para ${to} [ID: ${info.messageId}]`);
        return true;
    } catch (error) {
        console.error(`❌ Falha ao enviar e-mail para ${to}:`, error.message);
        return false;
    }
};

// ==============================================================================
// 3. FUNÇÕES DE ENVIO REAIS (Usadas pelo Site e Bot)
// ==============================================================================

export const sendAbandonedCartEmail = async (user, items) => {
    const firstName = user.nome_completo.split(' ')[0];
    const frontendUrl = process.env.FRONTEND_URL?.replace(/\/$/, '') || 'http://localhost:3000';
    
    const productsHtml = items.map(item => `
        <div class="product-item">
            <img src="${getProductImage(item)}" alt="${item.nome}" class="product-img">
            <div>
                <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px;">${item.nome}</div>
                <div style="color: #666; font-size: 13px;">${formatCurrency(item.preco)}</div>
            </div>
        </div>
    `).join('');

    const body = `
        <p>Olá, <strong>${firstName}</strong>!</p>
        <p>Notamos que você saiu da loja sem finalizar sua compra. Seus itens estão te esperando, mas o estoque pode acabar.</p>
        <div class="product-list">${productsHtml}</div>
    `;

    const button = `<a href="${frontendUrl}/carrinho" class="btn">Finalizar Compra Agora</a>`;
    const html = await getEmailTemplate('Não perca seus itens!', body, button);

    await sendEmail({ to: user.email, subject: `🛒 Psst! Seus itens estão te esperando`, html });
};

export const sendPendingPaymentEmail = async (user, order) => {
    const firstName = user.nome_completo.split(' ')[0];
    const frontendUrl = process.env.FRONTEND_URL?.replace(/\/$/, '') || 'http://localhost:3000';

    const body = `
        <p>Olá, <strong>${firstName}</strong>.</p>
        <p>Recebemos o seu pedido <strong>#${order.id_pedido}</strong> com sucesso!</p>
        <p>Estamos apenas aguardando a confirmação do pagamento para iniciar o envio.</p>
        <div style="background: #fff3cd; color: #856404; padding: 15px; border-radius: 6px; margin: 20px 0; text-align: center;">
            <strong>Valor Total:</strong> ${formatCurrency(order.preco_total)}
        </div>
    `;

    const button = `<a href="${frontendUrl}/order/${order.id_pedido}" class="btn">Pagar Agora / Ver Pedido</a>`;
    const html = await getEmailTemplate('Aguardando Pagamento', body, button);

    await sendEmail({ to: user.email, subject: `⏳ Pagamento pendente: Pedido #${order.id_pedido}`, html });
};

export const sendPasswordResetEmail = async (email, nome, resetUrl) => {
    const firstName = nome.split(' ')[0];
    const body = `
        <p>Olá, <strong>${firstName}</strong>.</p>
        <p>Recebemos uma solicitação para redefinir a senha da sua conta.</p>
        <p>Se foi você, clique no botão abaixo para criar uma nova senha.</p>
    `;
    const button = `<a href="${resetUrl}" class="btn">Redefinir Minha Senha</a>`;
    const html = await getEmailTemplate('Recuperação de Senha', body, button);

    await sendEmail({ to: email, subject: '🔐 Redefinição de Senha', html });
};

// ==============================================================================
// 4. FUNÇÕES DE TESTE E SIMULAÇÃO (Usadas pelo Painel Admin e BotController)
// ==============================================================================

/**
 * ✅ CORREÇÃO: Função restaurada para compatibilidade com botController.js
 */
export const sendTestEmail = async (recipientEmail) => {
    const config = await ConfiguracaoModel.get('SMTP_HOST');
    const body = `
        <p>Parabéns! 🎉</p>
        <p>Este é um e-mail de teste básico para confirmar que seu servidor SMTP (${config}) está respondendo.</p>
    `;
    const html = await getEmailTemplate('Teste de Conexão Bem-sucedido', body);
    await sendEmail({ to: recipientEmail, subject: '✅ Teste de Configuração SMTP', html });
};

/**
 * Envia um e-mail visual completo. Usado pelo botão "Testar Conexão" do Admin.
 */
export const sendRichTestEmail = async (transporter, fromEmail, toEmail) => {
    const mockItems = [
        { nome: 'Produto Teste A', preco: 129.90, imagem_url: null, produto_subimagens: [] },
        { nome: 'Produto Teste B', preco: 89.90, imagem_url: null, produto_subimagens: [] }
    ];
    
    const productsHtml = mockItems.map(item => `
        <div class="product-item">
            <img src="${getProductImage(item)}" alt="${item.nome}" class="product-img">
            <div>
                <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px;">${item.nome}</div>
                <div style="color: #666; font-size: 13px;">${formatCurrency(item.preco)}</div>
            </div>
        </div>
    `).join('');

    const body = `
        <p style="color: #28a745; font-weight: bold;">✅ O envio de e-mail está funcionando!</p>
        <p>Este é um teste visual. Se você vê a logo e os produtos abaixo, está tudo certo.</p>
        <div class="product-list">${productsHtml}</div>
    `;

    const html = await getEmailTemplate('Teste de Configuração SMTP', body);
    const fromName = await ConfiguracaoModel.get('SMTP_FROM_NAME') || 'Loja Virtual';
    
    return transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: toEmail,
        subject: '✅ Teste Visual: SMTP Configurado!',
        html,
    });
};

/**
 * Gerencia cenários de teste (Carrinho, Senha, Pedido, etc)
 */
export const sendTestScenario = async (type, recipientEmail) => {
    console.log(`🧪 Iniciando cenário de teste: ${type} para ${recipientEmail}`);
    const frontendUrl = process.env.FRONTEND_URL?.replace(/\/$/, '') || 'http://localhost:3000';

    const mockUser = { nome_completo: 'Cliente Teste', email: recipientEmail };
    const mockOrder = { id_pedido: 9999, preco_total: 1549.90, data_pedido: new Date() };
    const mockItems = [
        { nome: 'Produto Teste Premium', preco: 999.90, imagem_url: 'https://placehold.co/200x200/EEE/31343C?text=Produto+A', produto_subimagens: [] },
        { nome: 'Acessório Exemplo', preco: 550.00, imagem_url: null, produto_subimagens: [{ url: 'https://placehold.co/200x200/EEE/31343C?text=Produto+B' }] }
    ];

    switch (type) {
        case 'abandoned_cart': await sendAbandonedCartEmail(mockUser, mockItems); break;
        case 'pending_payment': await sendPendingPaymentEmail(mockUser, mockOrder); break;
        case 'reset_password': await sendPasswordResetEmail(recipientEmail, mockUser.nome_completo, `${frontendUrl}/reset-password/TOKEN_TESTE`); break;
        case 'order_confirmed':
            const bodyConfirmed = `
                <p>Olá, <strong>${mockUser.nome_completo.split(' ')[0]}</strong>.</p>
                <p>Boas notícias! O pagamento do seu pedido <strong>#${mockOrder.id_pedido}</strong> foi confirmado.</p>
                <div style="background:#d4edda; color:#155724; padding:15px; border-radius:6px; margin:20px 0; text-align:center;">
                    <strong>Pagamento Aprovado</strong><br>Total: ${formatCurrency(mockOrder.preco_total)}
                </div>`;
            const btnConfirmed = `<a href="${frontendUrl}/order/${mockOrder.id_pedido}" class="btn">Acompanhar Pedido</a>`;
            const htmlConfirmed = await getEmailTemplate('Pedido Confirmado! 🎉', bodyConfirmed, btnConfirmed);
            await sendEmail({ to: recipientEmail, subject: `✅ Pedido #${mockOrder.id_pedido} Aprovado!`, html: htmlConfirmed });
            break;
        default: throw new Error('Tipo de teste desconhecido: ' + type);
    }
};