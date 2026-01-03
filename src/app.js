import express from 'express';
import dotenv from 'dotenv';
import { createServer } from 'http'; 
import { Server } from 'socket.io';  
import path from 'path';
import { fileURLToPath } from 'url'; 
import fs from 'fs'; 
import apiRoutes from './routes/index.js';
import errorHandler from './middlewares/errorHandler.js';
import corsMiddleware from './middlewares/corsMiddleware.js';
import { startBot } from './services/botService.js';

dotenv.config();

const app = express();

// --- 1. CONFIGURAÇÃO DE CAMINHOS ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const imagesPath = path.join(__dirname, '../images'); 

if (!fs.existsSync(imagesPath)){
    fs.mkdirSync(imagesPath, { recursive: true });
}

// --- 2. SERVIDOR E SOCKET.IO ---
const server = createServer(app); 
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.set('socketio', io); 
io.on('connection', (socket) => {
    // console.log(`📱 Cliente conectado via Socket: ${socket.id}`); // Comente se quiser o log limpo
});

// --- 3. MIDDLEWARES GLOBAIS ---
app.use(corsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ 4. TRATAMENTO SILENCIOSO DA ROTA /api
// Isso evita que ferramentas de terceiros (como o go-loco) gerem erros 404 no seu log
app.use((req, res, next) => {
    if (req.originalUrl === '/api' || req.originalUrl === '/api/') {
        // Se for um POST sem endpoint, apenas avisamos que está online
        return res.status(200).json({ status: 'API Online', message: 'Use endpoints específicos.' });
    }
    next();
});

// ✅ 5. CORREÇÃO DO FAVICON
app.get('/favicon.ico', (req, res) => res.status(204).end());

// --- 6. ROTA PARA SERVIR IMAGENS ---
app.use('/images', (req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*"); 
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
}, express.static(imagesPath));

// --- 7. ROTAS DA API ---
// Importante: A inicialização do Bot deve vir preferencialmente aqui ou no server.js
startBot();

app.get('/', (req, res) => {
    res.send('API do E-commerce está no ar!');
});

// Suas rotas principais (Elas devem vir ANTES do tratador de erro 404)
app.use('/api', apiRoutes);

// --- 8. TRATAMENTO DE ERROS (404) ---
app.use((req, res, next) => {
    // Verificamos se não é uma imagem faltando para não sujar o log de erro fatal
    if (req.originalUrl.startsWith('/images')) {
        return res.status(404).send('Imagem não encontrada');
    }
    
    const error = new Error(`Rota não encontrada - ${req.originalUrl}`);
    res.status(404);
    next(error);
});

app.use(errorHandler);

export { app, server }; 
export default server;