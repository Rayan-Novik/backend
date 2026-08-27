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
app.get('/api/sitemap.xml', async (req, res) => {
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
app.post('/api/webhooks/abacatepay', handleAbacateWebhook);

app.get('/api/tenants/verify/:domain', async (req, res) => {
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

// =========================================================
// 🛠️ CORREÇÃO DE URL PARA DOMÍNIOS CUSTOMIZADOS
// =========================================================
app.use((req, res, next) => {
    // Se a requisição for para as configurações públicas, removemos o domínio para deixar só o slug
    if (req.url.includes('/api/configuracoes/public/')) {
        req.url = req.url.replace(/\.azun\.com\.br/g, '')
                         .replace(/\.ararinhacloud\.shop/g, '');
    }
    next();
});

// =========================================================
// ✅ ROTAS PRINCIPAIS SAAS (Painel e Loja Virtual)
// =========================================================
// APLICA O LIMITER AQUI. ELE VAI FILTRAR QUEM ENTRA E QUEM PASSA DIRETO.
app.use('/api', globalLimiter, tenantResolver, apiRoutes);

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