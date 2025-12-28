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
const __filename = fileURLToPath(import.meta.url); // .../backend/src/app.js
const __dirname = path.dirname(__filename); // .../backend/src

// Define a pasta de imagens: sobe um nível (..) de 'src' para 'backend' e entra em 'images'
const imagesPath = path.join(__dirname, '../images'); 

console.log('📂 Caminho Absoluto das Imagens:', imagesPath);

// Cria a pasta se ela não existir
if (!fs.existsSync(imagesPath)){
    console.log('⚠️ Pasta images não existia, criando agora...');
    fs.mkdirSync(imagesPath, { recursive: true });
}

// --- 2. SERVIDOR E SOCKET.IO ---
const server = createServer(app); 

const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

app.set('socketio', io); 

io.on('connection', (socket) => {
    console.log(`📱 Cliente conectado via Socket: ${socket.id}`);
});

// --- 3. MIDDLEWARES GLOBAIS ---
app.use(corsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // ✅ Importante para uploads via formulário

// ✅ 4. CORREÇÃO DO FAVICON (Impede o erro 404 no log)
app.get('/favicon.ico', (req, res) => res.status(204).end());

// --- 5. ROTA PARA SERVIR IMAGENS ---
// Adiciona headers extras para garantir que o frontend consiga carregar a imagem sem bloqueio
app.use('/images', (req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*"); 
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
}, express.static(imagesPath));

// --- 6. ROTAS DA API ---
startBot();

app.get('/', (req, res) => {
    res.send('API do E-commerce está no ar!');
});

app.use('/api', apiRoutes);

// --- 7. TRATAMENTO DE ERROS ---
app.use((req, res, next) => {
    const error = new Error(`Rota não encontrada - ${req.originalUrl}`);
    res.status(404);
    next(error);
});

app.use(errorHandler);

export { app, server }; 
export default server;