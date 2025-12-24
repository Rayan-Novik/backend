import express from 'express';
import dotenv from 'dotenv';
import { createServer } from 'http'; //
import { Server } from 'socket.io';  //
import apiRoutes from './routes/index.js';
import errorHandler from './middlewares/errorHandler.js';
import corsMiddleware from './middlewares/corsMiddleware.js';
import { startBot } from './services/botService.js';

dotenv.config();

const app = express();

// ✅ Cria o servidor HTTP nativo para suportar WebSocket + Express
const server = createServer(app); //

// ✅ Configura o Socket.io
const io = new Server(server, {
    cors: {
        origin: "*", // Permite conexão de qualquer front (mobile/web)
        methods: ["GET", "POST"]
    }
});

// ✅ Torna o 'io' acessível em todas as rotas/controllers
app.set('socketio', io); //

// Evento de conexão (opcional, para debug)
io.on('connection', (socket) => {
    console.log(`📱 Cliente conectado via Socket: ${socket.id}`);
});

// Middlewares essenciais
app.use(corsMiddleware);
app.use(express.json());

// Inicia o bot
startBot();

// Rota de teste
app.get('/', (req, res) => {
    res.send('API do E-commerce está no ar!');
});

// Rotas da API
app.use('/api', apiRoutes);

// 404
app.use((req, res, next) => {
    const error = new Error(`Rota não encontrada - ${req.originalUrl}`);
    res.status(404);
    next(error);
});

// Error Handler
app.use(errorHandler);

// ✅ Exporta o 'server' em vez de apenas 'app', pois o Socket precisa do server HTTP
export { app, server }; 
export default server;