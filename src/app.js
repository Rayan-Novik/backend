import express from 'express';
import dotenv from 'dotenv';
import { createServer } from 'http'; 
import { Server } from 'socket.io';  
import path from 'path';
import { fileURLToPath } from 'url'; 
import fs from 'fs'; 
import rateLimit from 'express-rate-limit'; 
import helmet from 'helmet';

// --- IMPORTANDO O NOVO MIDDLEWARE SAAS ---
import { tenantResolver } from './middlewares/tenantMiddleware.js';

import apiRoutes from './routes/index.js'; 

// 🚀 IMPORTANDO AS ROTAS DA API PÚBLICA EXTERNA
import publicApiRoutes from './routes/publicApiRoutes.js';

import errorHandler from './middlewares/errorHandler.js';
import corsMiddleware from './middlewares/corsMiddleware.js';
import { handleAbacateWebhook } from './controllers/webhookController.js';

// 🟢 IMPORTANDO A FUNÇÃO DE RESTAURAÇÃO DE SESSÃO
import { connectWhatsApp, restoreWhatsAppSessions } from './services/whatsapp/connection.js';

// --- IMPORTANDO O SERVIÇO DE CRON ---
import { initMPRefreshCron, initIfoodPollingCron } from './services/cronManager.js'; // 🟢 CRON DO IFOOD ADICIONADO AQUI

import { PrismaClient } from '@prisma/client';
import { obterCargaSyncCaixa, processarEmissaoFiscalVendaPDV } from './controllers/vendaslocais/pdvController.js';
const prisma = new PrismaClient();

dotenv.config();

const app = express();
app.set('trust proxy', 1);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const imagesPath = path.join(__dirname, '../images'); 
if (!fs.existsSync(imagesPath)){
    fs.mkdirSync(imagesPath, { recursive: true });
}

const server = createServer(app); 
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});
global.io = io; 
app.set('socketio', io); 

const driverLocationsMemoria = {}; 

io.on('connection', (socket) => {
    console.log(`🔌 Cliente conectado via Socket: ${socket.id}`);
    
    socket.on('join_order', (id_pedido) => {
        const room = `order_${id_pedido}`;
        socket.join(room);
        if (driverLocationsMemoria[id_pedido]) {
            socket.emit('location_updated', driverLocationsMemoria[id_pedido]);
        }
    });

    socket.on('update_location', (data) => {
        driverLocationsMemoria[data.id_pedido] = {
            lat: data.lat, lng: data.lng, timestamp: new Date()
        };
        io.to(`order_${data.id_pedido}`).emit('location_updated', {
            lat: data.lat, lng: data.lng
        });
    });

    socket.on('delivery_completed', (id_pedido) => {
        delete driverLocationsMemoria[id_pedido];
    });

    socket.on('disconnect', () => console.log(`❌ Desconectado: ${socket.id}`));
});

// Configuração do Helmet atualizada para permitir visualização de mídias em Popups
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            // Permite que o conteúdo seja incorporado pelo seu frontend
            "frame-ancestors": ["'self'", "*"], 
            "img-src": ["'self'", "data:", "*"],
            "media-src": ["'self'", "data:", "*"],
        },
    },
    // Desativa o bloqueio rígido de frames para navegadores antigos
    xFrameOptions: false, 
}));
app.use(corsMiddleware);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Captura requisições com JSON malformado e evita logar exceções de sintaxe
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({ success: false, error: "JSON inválido na requisição." });
    }
    next(err);
});

// =========================================================
// 🛡️ REGRAS DE BLOQUEIO (RATE LIMIT)
// =========================================================

const shouldSkipLimit = (req) => {
    // 🟢 MELHORIA: Aceita localhost com IPv4 e IPv6
    if (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip.includes('127.0.0.1')) return true;
    if (process.env.NODE_ENV === 'development') return true;
    if (req.originalUrl.includes('/webhooks')) return true;
    
    const MEU_IP_ESPECIFICO = '192.168.0.105'; 
    if (req.ip === MEU_IP_ESPECIFICO) return true;

    // 🚀 O PULO DO GATO: O Admin passa livre!
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        return true;
    }

    return false; // Se chegou aqui, é visitante da loja. Cai no limite normal.
};

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 300, // 🟢 AUMENTADO PARA 3000! Garante que clientes no Wi-Fi da loja não sejam bloqueados
    message: { message: "Muitas requisições, tente mais tarde." },
    standardHeaders: true, 
    legacyHeaders: false,
    skip: shouldSkipLimit 
});

// =========================================================
// 🌐 ROTAS PÚBLICAS GERAIS (Fora do controle de Tenant)
// =========================================================

app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Ararinha Backend</title>
            <style>
                body{
                    margin:0;
                    height:100vh;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    font-family:Arial, sans-serif;
                    color:white;
                    flex-direction:column;
                }
                img{
                    max-width:400px;
                    height:auto;
                }
                h1{
                    margin-top:20px;
                    font-size:20px;
                    opacity:0.8;
                    color:black;
                }
            </style>
        </head>
        <body>
            <img src="/images/ararinha.png" alt="Ararinha Backend"/>
        </body>
        </html>
    `);
});

app.get('/api', (req, res) => {
    res.status(200).json({ status: 'API Online', version: 'SaaS 1.0' });
});

// --- ROTA DE SITEMAP DINÂMICO PARA SEO ---
app.get(['/api/sitemap.xml', '/sitemap.xml'], async (req, res) => {
    try {
        const tenants = await prisma.tenants.findMany({
            where: { ativo: true }, 
            select: { slug: true, dominio_customizado: true }
        });

        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://ararinhacloud.shop</loc>
    <priority>1.0</priority>
  </url>`;

        tenants.forEach(t => {
            const urlLoja = t.dominio_customizado 
                ? `https://${t.dominio_customizado}` 
                : `https://${t.slug}.ararinhacloud.shop`;
            xml += `
  <url>
    <loc>${urlLoja}</loc>
    <priority>0.8</priority>
  </url>`;
        });

        xml += '\n</urlset>';
        res.header('Content-Type', 'application/xml');
        return res.status(200).send(xml);
    } catch (error) {
        console.error('Erro ao gerar sitemap:', error);
        return res.status(500).send('Erro ao gerar sitemap');
    }
});

// Arquivos Estáticos (Imagens)
app.use('/images', (req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*"); 
    next();
}, express.static(imagesPath));

// BLOCO DOS UPLOADS:
const uploadsPath = path.join(__dirname, '../uploads'); 
if (!fs.existsSync(uploadsPath)){
    fs.mkdirSync(uploadsPath, { recursive: true });
}

app.use('/uploads', (req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*"); 
    res.header("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges");
    
    // 🛡️ Permissões específicas para o Firefox carregar PDF/Vídeo no Modal
    res.header("Content-Security-Policy", "frame-ancestors *");
    res.header("X-Frame-Options", "ALLOWALL");
    
    next();
}, express.static(uploadsPath));

app.get('/favicon.ico', (req, res) => res.status(204).end());

// Webhooks de Pagamento
app.post(['/api/webhooks/abacatepay', '/webhooks/abacatepay'], handleAbacateWebhook);

app.get(['/api/tenants/verify/:domain', '/tenants/verify/:domain'], async (req, res) => {
    try {
        const domain = req.params.domain;

        let slug = domain.split('.')[0];
        if (slug === 'www') slug = domain.split('.')[1];

        const tenant = await prisma.tenants.findUnique({ where: { slug: slug } });

        if (tenant && tenant.ativo) {
            return res.json({ tenantId: tenant.id, slug: tenant.slug });
        } else {
            return res.status(404).json({ error: 'Loja não encontrada ou inativa' });
        }
    } catch (error) {
        console.error("Erro ao verificar loja no verify:", error);
        return res.status(500).json({ error: 'Erro interno no servidor' });
    }
});

// =========================================================
// 🚀 ROTA DA API PÚBLICA (Para integrações externas)
// Bypassa o tenantResolver, usa o apiKeyAuth interno para achar a loja
// =========================================================
app.use('/api/v1', globalLimiter, publicApiRoutes);
app.use('/v1', globalLimiter, publicApiRoutes);

// =========================================================
// 🛠️ CORREÇÃO DE URL PARA DOMÍNIOS CUSTOMIZADOS
// =========================================================
app.use((req, res, next) => {
    // Se a requisição for para as configurações públicas, removemos o domínio para deixar só o slug
    if (req.url.includes('/configuracoes/public/')) {
        req.url = req.url.replace(/\.azun\.com\.br/g, '')
                         .replace(/\.ararinhacloud\.shop/g, '');
    }
    next();
});

// 🩺 Health Check direto do PDV Desktop
app.all(['/api/pdv/health', '/pdv/health'], (req, res) => res.json({ status: 'OK', online: true, timestamp: new Date().toISOString() }));

// 📦 Recebimento de Vendas e Movimentações Offline do PDV Desktop
app.post(['/api/sync/movimento', '/sync/movimento'], async (req, res) => {
    try {
        const token = req.query.token || req.headers['x-token-caixa'] || req.headers['x-token-dispositivo'] || req.headers['authorization']?.replace('Bearer ', '');
        const lote = Array.isArray(req.body) ? req.body : (req.body?.lote || []);
        console.log(`[SYNC DESKTOP] Recebidas ${lote.length} movimentações offline do PDV (Token: ${token || 'N/A'}).`);

        let caixa = null;
        if (token) {
            caixa = await prisma.pdv_caixas.findFirst({
                where: { token_conexao: String(token) }
            });
            if (caixa && !caixa.hardware_id) {
                const hwid = req.headers['x-hwid'] || req.query.hwid || 'PAREADO';
                const comp = req.headers['x-computador'] || req.query.computador;
                const hwidStr = comp ? `${hwid} (${comp})` : String(hwid);
                await prisma.pdv_caixas.update({
                    where: { id: caixa.id },
                    data: { hardware_id: hwidStr, updated_at: new Date() }
                });
            }
        }

        const id_tenant = req.tenantId || (caixa ? Number(caixa.tenant_id) : 1);

        // Busca ou cria o consumidor padrão para o tenant
        const emailPadrao = `consumidor_${id_tenant}@pdv.padrao`;
        let consumidorPadrao = await prisma.usuarios.findFirst({
            where: { email: emailPadrao, id_tenant }
        });
        if (!consumidorPadrao) {
            consumidorPadrao = await prisma.usuarios.create({
                data: {
                    nome_completo: 'Consumidor Final',
                    email: emailPadrao,
                    hash_senha: 'pdv_password_safe',
                    id_tenant
                }
            });
        }

        // Busca ou abre uma sessão de caixa_pdv para registrar o saldo
        let caixaAberto = await prisma.caixa_pdv.findFirst({
            where: { id_tenant, status: 'ABERTO' },
            orderBy: { data_abertura: 'desc' }
        });

        const processados = [];

        for (const item of lote) {
            try {
                if (item.entidade === 'VENDA') {
                    let venda = item.payload;
                    if (typeof venda === 'string') {
                        try {
                            venda = JSON.parse(venda);
                        } catch (e) {
                            venda = JSON.parse(venda.replace(/\\"/g, '"'));
                        }
                    }

                    if (!venda || !venda.itens) {
                        processados.push(item.id);
                        continue;
                    }

                    const totalLiquido = Number(venda.valor_total || 0);

                    // Cria o pedido no MySQL
                    const novoPedido = await prisma.pedidos.create({
                        data: {
                            id_tenant: id_tenant,
                            id_usuario: consumidorPadrao.id_usuario,
                            id_caixa_pdv: caixaAberto ? caixaAberto.id_caixa : null,
                            preco_itens: totalLiquido,
                            preco_frete: 0,
                            preco_total: totalLiquido,
                            metodo_pagamento: venda.descricao_pagamento || 'DINHEIRO',
                            status_pagamento: 'PAGO',
                            status_entrega: 'Entregue',
                            canal_venda: 'PDV',
                            origem_criacao: 'DESKTOP',
                            sincronizado_cloud: true,
                            data_pedido: new Date(venda.data_hora || Date.now()),
                            pedido_items: {
                                create: (venda.itens || []).map(it => ({
                                    id_produto: it.id && !isNaN(Number(it.id)) ? Number(it.id) : null,
                                    nome: it.nome || 'Produto',
                                    quantidade: Number(it.quantidade || 1),
                                    preco: Number(it.preco || 0),
                                    id_tenant: id_tenant
                                }))
                            }
                        }
                    });

                    // Dá baixa no estoque de cada produto vendido
                    for (const it of (venda.itens || [])) {
                        if (it.id && !isNaN(Number(it.id))) {
                            await prisma.produtos.updateMany({
                                where: { id_produto: Number(it.id), id_tenant },
                                data: { estoque: { decrement: Number(it.quantidade || 1) } }
                            }).catch(() => {});
                        }
                    }

                    // Incrementa saldo do caixa aberto se houver
                    if (caixaAberto) {
                        await prisma.caixa_pdv.update({
                            where: { id_caixa: caixaAberto.id_caixa },
                            data: { saldo_sistema: { increment: totalLiquido } }
                        }).catch(() => {});
                    }

                    // 🧾 Emissão Fiscal Automática (NFC-e) para SEFAZ e registro na tabela fiscal_notas (Notas de Saída)
                    if (venda.modo_fiscal !== 'NAO_FISCAL') {
                        try {
                            const itensParaFiscal = (venda.itens || []).map(it => ({
                                id_produto: it.id && !isNaN(Number(it.id)) ? Number(it.id) : null,
                                quantidade: Number(it.quantidade || 1),
                                preco: Number(it.preco || 0)
                            }));

                            await processarEmissaoFiscalVendaPDV({
                                id_tenant,
                                pedido: novoPedido,
                                itensParaSalvar: itensParaFiscal,
                                metodo_pagamento: venda.descricao_pagamento || novoPedido.metodo_pagamento || 'DINHEIRO',
                                caixa_id: caixa ? caixa.id : null,
                                cpf_cnpj_nota: venda.cpf_nota || null,
                                tipo_documento_fiscal: 'NFCE',
                                descontoVenda: 0
                            });
                            console.log(`[SYNC DESKTOP] 📜 NFC-e gerada e vinculada com sucesso ao Pedido ID: ${novoPedido.id_pedido} na tabela fiscal_notas.`);
                        } catch (fiscErr) {
                            console.warn(`[SYNC DESKTOP] ⚠️ Venda ${novoPedido.id_pedido} salva no banco, mas aviso fiscal:`, fiscErr.message);
                        }
                    }

                    console.log(`[SYNC DESKTOP] ✅ Venda ${item.registro_id} inserida no MySQL com sucesso! Pedido ID: ${novoPedido.id_pedido}, Total: R$ ${totalLiquido}`);
                    processados.push(item.id);
                } else if (item.entidade === 'TURNO_ABERTURA') {
                    let turnoData = item.payload;
                    if (typeof turnoData === 'string') {
                        try { turnoData = JSON.parse(turnoData); } catch (e) { turnoData = JSON.parse(turnoData.replace(/\\"/g, '"')); }
                    }
                    const saldoIni = Number(turnoData?.saldo_inicial || 0);
                    let opId = Number(turnoData?.operador_id);
                    if (isNaN(opId) || opId <= 0) {
                        const func = await prisma.funcionarios.findFirst({ where: { id_tenant, ativo: true } });
                        opId = func ? func.id_funcionario : consumidorPadrao.id_usuario;
                    } else {
                        // Verifica se o funcionário existe para respeitar a chave estrangeira
                        const funcExiste = await prisma.funcionarios.findFirst({ where: { id_funcionario: opId, id_tenant } });
                        if (!funcExiste) {
                            const funcPadrao = await prisma.funcionarios.findFirst({ where: { id_tenant, ativo: true } });
                            opId = funcPadrao ? funcPadrao.id_funcionario : opId;
                        }
                    }

                    // Verifica se já existe um caixa aberto para esse tenant
                    let caixaJaAberto = await prisma.caixa_pdv.findFirst({
                        where: { id_tenant, status: 'ABERTO' },
                        orderBy: { data_abertura: 'desc' }
                    });

                    if (!caixaJaAberto) {
                        caixaJaAberto = await prisma.caixa_pdv.create({
                            data: {
                                id_tenant,
                                id_usuario: opId,
                                saldo_inicial: saldoIni,
                                saldo_sistema: saldoIni,
                                status: 'ABERTO',
                                data_abertura: new Date(turnoData?.data_abertura || Date.now())
                            }
                        });
                        console.log(`[SYNC DESKTOP] 🔓 Turno aberto registrado no MySQL! Caixa ID: ${caixaJaAberto.id_caixa}, Saldo: R$ ${saldoIni}`);
                    } else {
                        console.log(`[SYNC DESKTOP] ℹ️ Caixa já se encontra ABERTO no MySQL (ID: ${caixaJaAberto.id_caixa}). Mantendo turno ativo.`);
                    }
                    processados.push(item.id);
                } else if (item.entidade === 'TURNO_FECHAMENTO') {
                    let fechData = item.payload;
                    if (typeof fechData === 'string') {
                        try { fechData = JSON.parse(fechData); } catch (e) { fechData = JSON.parse(fechData.replace(/\\"/g, '"')); }
                    }
                    const saldoFim = Number(fechData?.saldo_final || 0);
                    
                    // Fecha todos os caixas abertos do tenant com saldo_final correto
                    const fechados = await prisma.caixa_pdv.updateMany({
                        where: { id_tenant, status: 'ABERTO' },
                        data: {
                            status: 'FECHADO',
                            saldo_final: saldoFim,
                            data_fechamento: new Date()
                        }
                    });
                    console.log(`[SYNC DESKTOP] 🔒 Turno(s) fechado(s) no MySQL! (${fechados.count} caixas atualizados com status FECHADO, Saldo Final: R$ ${saldoFim})`);
                    processados.push(item.id);
                } else if (item.entidade === 'SANGRIA' || item.entidade === 'SUPRIMENTO') {
                    let movData = item.payload;
                    if (typeof movData === 'string') {
                        try { movData = JSON.parse(movData); } catch (e) { movData = JSON.parse(movData.replace(/\\"/g, '"')); }
                    }
                    const val = Number(movData?.valor || 0);
                    const delta = item.entidade === 'SUPRIMENTO' ? val : -val;
                    if (caixaAberto) {
                        await prisma.caixa_pdv.update({
                            where: { id_caixa: caixaAberto.id_caixa },
                            data: { saldo_sistema: { increment: delta } }
                        }).catch(() => {});
                    }
                    console.log(`[SYNC DESKTOP] 💵 ${item.entidade} de R$ ${val} registrada no caixa aberto.`);
                    processados.push(item.id);
                } else {
                    processados.push(item.id);
                }
            } catch (itemErr) {
                console.error(`[SYNC ITEM ERROR] Falha no item ${item.id}:`, itemErr);
                processados.push(item.id);
            }
        }

        return res.json({
            success: true,
            message: `Lote de ${processados.length} movimentações sincronizado com sucesso no MySQL!`,
            total_processados: processados.length,
            ids_confirmados: processados
        });
    } catch (err) {
        console.error("[SYNC DESKTOP ERROR]:", err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

// 📦 Carga de Catálogo para o PDV Desktop
app.all(['/api/sync/catalogo', '/sync/catalogo'], obterCargaSyncCaixa);

// =========================================================
// ✅ ROTAS PRINCIPAIS SAAS (Painel e Loja Virtual)
// =========================================================
// APLICA O LIMITER AQUI. ELE VAI FILTRAR QUEM ENTRA E QUEM PASSA DIRETO.
app.use('/api', globalLimiter, tenantResolver, apiRoutes);
app.use('/', globalLimiter, tenantResolver, apiRoutes);

// --- TRATAMENTO DE ERROS ---
app.use((req, res, next) => {
    if (req.originalUrl.startsWith('/images')) return res.status(404).send('Arquivo não encontrado');
    if (!req.originalUrl.includes('.map') && !req.originalUrl.includes('favicon')) {
        console.error(`❌ 404: ${req.method} ${req.originalUrl}`);
    }
    const error = new Error(`Rota não encontrada - ${req.originalUrl}`);
    res.status(404);
    next(error);
});

app.use(errorHandler);

setTimeout(() => {
    console.log("🤖 Iniciando robô do WhatsApp e agendamentos...");
    
    try {
        initMPRefreshCron();
        console.log("✅ Sistema de renovação de tokens MP ativado.");

        // 🟢 INICIA O CRON GLOBAL DE PEDIDOS DO IFOOD
        initIfoodPollingCron();
        console.log("✅ Sistema Multi-Tenant de Polling do iFood ativado.");
        
        // 🟢 RESTAURADOR AUTOMÁTICO DE SESSÕES DO WHATSAPP
        restoreWhatsAppSessions();
        
    } catch (cronError) {
        console.error("⚠️ Erro ao iniciar Cron MP/WhatsApp/iFood:", cronError);
    }
}, 15000); 

export { app, server }; 
export default server;