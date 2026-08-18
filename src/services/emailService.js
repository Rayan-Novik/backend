import nodemailer from 'nodemailer';
import ConfiguracaoModel from '../models/configuracaoModel.js';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const prisma = new PrismaClient();

const formatCurrency = (value) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const getProductImage = (item) => {
    if (item.imagem_url) return item.imagem_url;
    if (item.produto_subimagens && item.produto_subimagens.length > 0) {
        return item.produto_subimagens[0].url;
    }
    return 'https://placehold.co/100x100?text=Sem+Foto'; 
};

const getLogoUrl = async (id_tenant) => {
    let logoPath = await ConfiguracaoModel.get('LOGO_URL', id_tenant);
    if (!logoPath) return null;
    if (logoPath.startsWith('http')) return logoPath;
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000'; 
    return `${backendUrl}${logoPath.startsWith('/') ? '' : '/'}${logoPath}`;
};

const replaceVariables = (text, variables) => {
    if (!text) return '';
    let newText = text;
    for (const key in variables) {
        const regex = new RegExp(`{${key}}`, 'g');
        newText = newText.replace(regex, variables[key] || '');
    }
    return newText;
};

const getBaseHtml = async (title, bodyContent, actionButton = null, id_tenant) => {
    const primaryColor = '#0d6efd'; 
    const logoUrl = await getLogoUrl(id_tenant); 
    const siteTitle = await ConfiguracaoModel.get('SITE_TITLE', id_tenant) || 'Loja Virtual';
    
    const signature = await ConfiguracaoModel.get('SMTP_SIGNATURE', id_tenant) || '';
    const signatureImg = await ConfiguracaoModel.get('SMTP_SIGNATURE_IMAGE', id_tenant) || '';

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
            .box-destaque { background-color: #f8f9fa; border-left: 4px solid ${primaryColor}; padding: 15px; margin: 20px 0; border-radius: 4px; }
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
                ${title ? `<h2>${title}</h2>` : ''}
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

const getTransporter = async (id_tenant) => {
    let config = {
        host: await ConfiguracaoModel.get('SMTP_HOST', id_tenant),
        port: await ConfiguracaoModel.get('SMTP_PORT', id_tenant),
        user: await ConfiguracaoModel.get('SMTP_USER', id_tenant),
        pass: await ConfiguracaoModel.get('SMTP_PASS', id_tenant),
        secure: await ConfiguracaoModel.get('SMTP_SECURE', id_tenant),
        isFallback: false 
    };

    if (!config.host || !config.user || !config.pass) {
        console.log(`⚠️ Loja ${id_tenant} sem SMTP. Usando Servidor Master (SaaS)...`);
        
        config = {
            host: await ConfiguracaoModel.get('SMTP_HOST', 1),
            port: await ConfiguracaoModel.get('SMTP_PORT', 1),
            user: await ConfiguracaoModel.get('SMTP_USER', 1),
            pass: await ConfiguracaoModel.get('SMTP_PASS', 1),
            secure: await ConfiguracaoModel.get('SMTP_SECURE', 1),
            isFallback: true
        };

        if (!config.host || !config.user || !config.pass) {
            console.warn(`❌ SMTP Master não configurado. O envio falhará.`);
            return null;
        }
    }

    const transporter = nodemailer.createTransport({
        host: config.host,
        port: Number(config.port),
        secure: config.secure === 'true', 
        auth: { user: config.user, pass: config.pass },
        tls: { rejectUnauthorized: false }
    });

    return { transporter, isFallback: config.isFallback };
};

const sendEmail = async ({ to, subject, html, id_tenant }) => {
    try {
        const setup = await getTransporter(id_tenant);
        if (!setup || !setup.transporter) throw new Error('Configuração SMTP inválida para este lojista e para o Master.');

        const { transporter, isFallback } = setup;

        let fromName = await ConfiguracaoModel.get('SMTP_FROM_NAME', id_tenant);
        let fromEmail = await ConfiguracaoModel.get('SMTP_FROM_EMAIL', id_tenant) || await ConfiguracaoModel.get('SMTP_USER', id_tenant);

        if (isFallback) {
            const masterEmail = await ConfiguracaoModel.get('SMTP_FROM_EMAIL', 1) || await ConfiguracaoModel.get('SMTP_USER', 1);
            fromEmail = masterEmail; 
            
            if (!fromName) {
                fromName = await ConfiguracaoModel.get('SITE_TITLE', id_tenant) || 'Loja Virtual';
            }
        } else {
            if (!fromName) fromName = 'Loja Virtual';
        }

        const info = await transporter.sendMail({
            from: `"${fromName}" <${fromEmail}>`, 
            to,
            subject,
            html,
        });

        console.log(`✅ E-mail enviado para ${to} [Via ${isFallback ? 'SaaS Master' : 'Lojista'}]`);
        return true;
    } catch (error) {
        console.error(`❌ Falha ao enviar e-mail para ${to}:`, error.message);
        return false;
    }
};

const getStoreFrontendUrl = async (id_tenant) => {
    let baseDomain = 'ararinhacloud.shop';
    if (process.env.FRONTEND_URL) {
        baseDomain = process.env.FRONTEND_URL.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
    }
    
    try {
        const tenant = await prisma.tenants.findUnique({
            where: { id: Number(id_tenant) },
            select: { slug: true, dominio_customizado: true }
        });

        if (!tenant) return `https://${baseDomain}`;

        if (tenant.dominio_customizado) {
            return `https://${tenant.dominio_customizado}`;
        }

        return `https://${tenant.slug}.${baseDomain}`;

    } catch (error) {
        return `https://${baseDomain}`;
    }
};

export const sendDynamicEmail = async (type, user, data, configOverride = null, id_tenant) => {
    let config = configOverride;

    if (!config) {
        const configJson = await ConfiguracaoModel.get(`AUTOMATION_${type.toUpperCase()}`, id_tenant);
        config = configJson ? JSON.parse(configJson) : null;
    }

    if (config && !config.ativo && !configOverride) return;

    const firstName = user.nome_completo ? user.nome_completo.split(' ')[0] : 'Cliente';
    const frontendUrl = await getStoreFrontendUrl(id_tenant);

    let variables = {
        nome: firstName,
        nome_completo: user.nome_completo,
        email: user.email,
        site_url: frontendUrl,
        botao_acao: '' 
    };

    let defaultSubject = '';
    let defaultBody = '';
    let defaultButton = '';
    let productsHtml = '';

    if (type === 'ORDER_OUT_FOR_DELIVERY' && data.order) {
        variables.id_pedido = data.order.id_pedido;
        variables.pin = data.order.delivery_pin;
        
        variables.link_rastreio = `${frontendUrl}/order/${variables.id_pedido}`;
        variables.botao_acao = `<a href="${variables.link_rastreio}" class="btn">Acompanhar Entrega no Mapa</a>`;

        defaultSubject = `🚚 O seu pedido #${variables.id_pedido} saiu para entrega!`;
        defaultBody = `
            <p>Olá, <strong>${firstName}</strong>! Prepara a campainha!</p>
            <p>O entregador acabou de sair com o seu pedido <strong>#${variables.id_pedido}</strong> e já está a caminho do seu endereço.</p>
            
            <div class="box-destaque text-center">
                <p style="margin:0; font-size: 14px; color: #666;">Seu código de segurança (PIN):</p>
                <h1 style="margin: 5px 0 0 0; color: #0d6efd; letter-spacing: 5px;">${variables.pin}</h1>
                <p style="margin: 10px 0 0 0; font-size: 12px; color: #999;">Informe este código ao entregador para receber o pacote.</p>
            </div>
            
            <p>Você pode acompanhar o seu pedido clicando no botão abaixo:</p>
        `;
        defaultButton = variables.botao_acao;
    }
    else if (type === 'ORDER_READY_FOR_PICKUP' && data.order) {
        variables.id_pedido = data.order.id_pedido;
        variables.link_pedido = `${frontendUrl}/order/${data.order.id_pedido}`;
        variables.botao_acao = `<a href="${variables.link_pedido}" class="btn">Ver Detalhes do Pedido</a>`;

        defaultSubject = `🛍️ Seu pedido #${variables.id_pedido} está pronto para retirada!`;
        defaultBody = `
            <p>Boas notícias, <strong>${firstName}</strong>!</p>
            <p>O seu pedido <strong>#${variables.id_pedido}</strong> já foi separado e embalado. Você já pode vir buscar em nossa loja!</p>
            
            <div class="box-destaque">
                <p style="margin:0;"><strong>O que levar:</strong></p>
                <ul style="margin-top: 5px; margin-bottom:0; padding-left: 20px; color: #555;">
                    <li>Um documento com foto.</li>
                    <li>O número do seu pedido (#${variables.id_pedido}).</li>
                </ul>
            </div>
            <p>Estamos te esperando!</p>
        `;
        defaultButton = variables.botao_acao;
    }
    else if (type === 'ABANDONED_CART' && data.items) {
        variables.link_carrinho = `${frontendUrl}/carrinho`;
        
        productsHtml = data.items.map(item => `
            <div class="product-item">
                <img src="${getProductImage(item)}" alt="${item.nome}" class="product-img">
                <div>
                    <div style="font-weight: bold; font-size: 14px; margin-bottom: 4px;">${item.nome}</div>
                    <div style="color: #666; font-size: 13px;">${formatCurrency(item.preco)}</div>
                </div>
            </div>
        `).join('');

        variables.lista_produtos = `<div class="product-list">${productsHtml}</div>`;
        variables.botao_acao = `<a href="${variables.link_carrinho}" class="btn">Recuperar Carrinho</a>`;

        defaultSubject = `🛒 Psst! Seus itens estão te esperando`;
        defaultBody = `
            <p>Olá, <strong>{nome}</strong>!</p>
            <p>Notamos que você saiu da loja sem finalizar sua compra. Seus itens estão te esperando, mas o estoque pode acabar.</p>
            {lista_produtos}
        `;
        defaultButton = variables.botao_acao;
    }
    else if (type === 'PENDING_PAYMENT' && data.order) {
        variables.id_pedido = data.order.id_pedido;
        variables.valor_total = formatCurrency(data.order.preco_total);
        variables.link_pedido = `${frontendUrl}/order/${data.order.id_pedido}`;
        variables.botao_acao = `<a href="${variables.link_pedido}" class="btn">Pagar Agora</a>`;

        defaultSubject = `⏳ Pagamento pendente: Pedido #{id_pedido}`;
        defaultBody = `
            <p>Olá, <strong>{nome}</strong>.</p>
            <p>Recebemos o seu pedido <strong>#{id_pedido}</strong> com sucesso!</p>
            <p>Estamos apenas aguardando a confirmação do pagamento para iniciar o envio.</p>
            <div class="box-destaque text-center">
                <strong>Valor Total:</strong> {valor_total}
            </div>
        `;
        defaultButton = variables.botao_acao;
    }
    else if (type === 'ORDER_CONFIRMED' && data.order) {
        variables.id_pedido = data.order.id_pedido;
        variables.valor_total = formatCurrency(data.order.preco_total);
        variables.link_pedido = `${frontendUrl}/order/${data.order.id_pedido}`;
        variables.botao_acao = `<a href="${variables.link_pedido}" class="btn">Acompanhar Pedido</a>`;

        defaultSubject = `✅ Pedido #{id_pedido} Confirmado!`;
        defaultBody = `
            <p>Olá, <strong>{nome}</strong>.</p>
            <p>Pagamento confirmado! Já estamos preparando o seu pedido <strong>#{id_pedido}</strong>.</p>
            <div style="background: #d4edda; color: #155724; padding: 15px; border-radius: 6px; margin: 20px 0; text-align: center;">
                <strong>Valor Pago:</strong> {valor_total}
            </div>
        `;
        defaultButton = variables.botao_acao;
    }
    else if (type === 'RESET_PASSWORD' && data.resetUrl) {
        variables.link_reset = data.resetUrl;
        variables.botao_acao = `<a href="${data.resetUrl}" class="btn">Criar Nova Senha</a>`;

        defaultSubject = `🔐 Solicitação de Redefinição de Senha`;
        
        // 🟢 E-MAIL DE SENHA MELHORADO E COM ALERTA ANTIFRAUDE
        defaultBody = `
            <p>Olá, <strong>{nome}</strong>.</p>
            <p>Recebemos um pedido para redefinir a senha da sua conta. Se foi você quem solicitou, clique no botão abaixo para criar uma nova senha com segurança:</p>
            
            <div style="text-align: center; margin: 35px 0;">
                {botao_acao}
            </div>

            <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin-top: 30px; border-radius: 4px; color: #664d03; font-size: 13px; line-height: 1.6; text-align: left;">
                <p style="margin-top: 0; font-weight: bold; font-size: 14px;">⚠️ Alerta Antifraude e Segurança:</p>
                <ul style="margin-bottom: 0; padding-left: 20px;">
                    <li style="margin-bottom: 5px;">Este link é único, pessoal e <strong>expira em 1 hora</strong>.</li>
                    <li style="margin-bottom: 5px;"><strong>Se você NÃO solicitou</strong> essa redefinição, apenas ignore este e-mail. A sua conta e seus dados continuam seguros.</li>
                    <li style="margin-bottom: 5px;">Nenhum de nossos atendentes irá pedir sua senha, token ou dados do seu cartão por e-mail, telefone ou WhatsApp.</li>
                    <li>Sempre verifique se a URL da página contém um cadeado de segurança (🔒) antes de digitar sua nova senha.</li>
                </ul>
            </div>
        `;
        defaultButton = variables.botao_acao;
    }

    const finalSubjectRaw = (config && config.assunto) ? config.assunto : defaultSubject;
    let finalBodyRaw = (config && config.corpo) ? config.corpo : defaultBody;

    const finalSubject = replaceVariables(finalSubjectRaw, variables);
    let finalBody = replaceVariables(finalBodyRaw, variables);

    // 🟢 TRAVA DE SEGURANÇA INTELIGENTE
    // Verifica se a tag {botao_acao} já foi processada ou está no texto cru
    let buttonToInject = defaultButton;
    if (finalBodyRaw.includes('{botao_acao}') || finalBody.includes('class="btn"')) {
        buttonToInject = null; // O botão já está no meio do corpo, não injeta no final
    }

    const fullHtml = await getBaseHtml(null, finalBody, buttonToInject, id_tenant);
    await sendEmail({ to: user.email, subject: finalSubject, html: fullHtml, id_tenant: id_tenant });
};

export const sendOrderOutForDeliveryEmail = async (user, order, id_tenant) => {
    await sendDynamicEmail('ORDER_OUT_FOR_DELIVERY', user, { order }, null, id_tenant);
};

export const sendOrderReadyForPickupEmail = async (user, order, id_tenant) => {
    await sendDynamicEmail('ORDER_READY_FOR_PICKUP', user, { order }, null, id_tenant);
};

export const sendAbandonedCartEmail = async (user, items, id_tenant) => {
    await sendDynamicEmail('ABANDONED_CART', user, { items }, null, id_tenant);
};

export const sendPendingPaymentEmail = async (user, order, id_tenant) => {
    await sendDynamicEmail('PENDING_PAYMENT', user, { order }, null, id_tenant);
};

export const sendPasswordResetEmail = async (email, nome, resetUrl, id_tenant) => {
    const user = { email, nome_completo: nome };
    await sendDynamicEmail('RESET_PASSWORD', user, { resetUrl }, null, id_tenant);
};

export const sendTestEmail = async (recipientEmail, id_tenant) => {
    const host = await ConfiguracaoModel.get('SMTP_HOST', id_tenant);
    const body = `<p>Teste de conexão com <strong>${host}</strong> realizado com sucesso.</p>`;
    const html = await getBaseHtml('Teste SMTP', body, null, id_tenant);
    await sendEmail({ to: recipientEmail, subject: '✅ Teste SMTP', html, id_tenant: id_tenant });
};

export const sendRichTestEmail = async (transporter, fromEmail, toEmail, id_tenant) => {
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

    const html = await getBaseHtml('Teste de Configuração SMTP', body, null, id_tenant);
    const fromName = await ConfiguracaoModel.get('SMTP_FROM_NAME', id_tenant) || 'Loja Virtual';
    
    return transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: toEmail,
        subject: '✅ Teste Visual: SMTP Configurado!',
        html,
    });
};

export const sendTestScenario = async (type, recipientEmail, id_tenant) => {
    console.log(`🧪 Iniciando cenário de teste: ${type} para ${recipientEmail} (Loja ${id_tenant})`);
    
    const frontendUrl = await getStoreFrontendUrl(id_tenant);

    const mockUser = { nome_completo: 'Cliente Teste', email: recipientEmail };
    const mockOrder = { id_pedido: 9999, preco_total: 1549.90 };
    const mockItems = [
        { nome: 'Produto Teste Premium', preco: 999.90, imagem_url: 'https://placehold.co/200x200?text=Produto+A' },
        { nome: 'Acessório Exemplo', preco: 550.00, imagem_url: 'https://placehold.co/200x200?text=Produto+B' }
    ];

    switch (type) {
        case 'abandoned_cart': 
            await sendDynamicEmail('ABANDONED_CART', mockUser, { items: mockItems }, null, id_tenant); 
            break;
        case 'pending_payment': 
            await sendDynamicEmail('PENDING_PAYMENT', mockUser, { order: mockOrder }, null, id_tenant); 
            break;
        case 'reset_password': 
            await sendDynamicEmail('RESET_PASSWORD', mockUser, { resetUrl: `${frontendUrl}/reset-password/TOKEN_TESTE` }, null, id_tenant); 
            break;
        case 'order_confirmed':
            await sendDynamicEmail('ORDER_CONFIRMED', mockUser, { order: mockOrder }, null, id_tenant);
            break;
        default: throw new Error('Cenário desconhecido: ' + type);
    }
};