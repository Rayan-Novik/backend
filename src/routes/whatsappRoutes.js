import express from 'express';
import multer from 'multer';

// 🟢 Controladores
import { getStatus, logout, connect, sendMessage, getAiConfig, updateAiConfig } from '../controllers/whatsapp/whatsappController.js';
import { 
    getChats, 
    getMessagesByJid, 
    sendChatMessage, 
    deleteMessage, 
    editMessage, 
    sendMediaMessage,
    updateChatStatus,
    analyzeMediaMessage,
    limparHistorico,
} from '../controllers/whatsapp/chatController.js';

import { 
    getRespostasRapidas, 
    createRespostaRapida, 
    updateRespostaRapida, 
    deleteRespostaRapida 
} from '../controllers/whatsapp/respostasController.js';

import { gerarCobrançaChat } from '../controllers/whatsapp/whatsappPaymentController.js';

// 🟢 Middlewares
import { protect } from '../middlewares/authMiddleware.js';
import { requirePermission } from '../middlewares/permissionMiddleware.js';

// 🟢 Configuração do Multer (Lê o arquivo na memória RAM)
const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

// ==========================================================
// ⚙️ GESTÃO DA CONEXÃO WHATSAPP (Aba de Configurações)
// ==========================================================

// Verificar status (Conectado, QR Code, Aguardando Código, etc)
router.get('/status', protect, requirePermission('WHATSAPP_MANAGE'), getStatus); 

// Desconectar a instância (Logout)
router.post('/logout', protect, requirePermission('WHATSAPP_MANAGE'), logout);

// Gerar QR Code ou iniciar processo de conexão (Pairing Code)
router.post('/connect', protect, requirePermission('WHATSAPP_MANAGE'), connect);

// Disparar mensagens avulsas ou testes manuais pelo painel
router.post('/send', protect, requirePermission('WHATSAPP_MANAGE'), sendMessage);


// ==========================================================
// 💬 SISTEMA DE CHAT DO WHATSAPP (Aba do CRM)
// ==========================================================

// 1. Listar todas as conversas na barra lateral
router.get('/chats', protect, requirePermission('WHATSAPP_VIEW'), getChats);

// 2. Carregar as mensagens de um contato específico
router.get('/chats/:jid', protect, requirePermission('WHATSAPP_VIEW'), getMessagesByJid);

// 3. Enviar mensagem de TEXTO pelo chat
router.post('/chats/send', protect, requirePermission('WHATSAPP_SEND'), sendChatMessage);

// 4. Enviar ARQUIVOS (Fotos, Vídeos, Áudio, PDFs) pelo chat
router.post('/chats/send-media', protect, requirePermission('WHATSAPP_SEND'), upload.single('file'), sendMediaMessage);

// 5. Apagar mensagem
router.delete('/chats/:jid/messages/:messageId', protect, requirePermission('WHATSAPP_SEND'), deleteMessage);

// 6. Editar mensagem
router.put('/chats/:jid/messages/:messageId', protect, requirePermission('WHATSAPP_SEND'), editMessage);

// Analisar mídia com IA (Requer que a pessoa possa ler o chat, faz sentido ser VIEW ou SEND)
router.post('/chats/:jid/messages/:messageId/ai', protect, requirePermission('WHATSAPP_VIEW'), analyzeMediaMessage);

// 7. 🟢 Atualizar o status da conversa (Atendendo, Pendente, Arquivado)
router.put('/chats/:jid/status', protect, requirePermission('WHATSAPP_SEND'), updateChatStatus);

// Limpar todo o histórico (Ação destrutiva, apenas gerentes)
router.delete('/chats/limpar-tudo', protect, requirePermission('WHATSAPP_MANAGE'), limparHistorico);

// ==========================================================
// ⚡ RESPOSTAS RÁPIDAS
// ==========================================================

// Listar todas as respostas (Atendentes precisam ver para usar)
router.get('/respostas-rapidas', protect, requirePermission('WHATSAPP_VIEW'), getRespostasRapidas);

// Criar nova resposta (Apenas gerentes devem padronizar respostas da empresa)
router.post('/respostas-rapidas', protect, requirePermission('WHATSAPP_MANAGE'), createRespostaRapida);

// Atualizar resposta
router.put('/respostas-rapidas/:id', protect, requirePermission('WHATSAPP_MANAGE'), updateRespostaRapida);

// Deletar resposta
router.delete('/respostas-rapidas/:id', protect, requirePermission('WHATSAPP_MANAGE'), deleteRespostaRapida);


// ==========================================================
// 💰 MAQUININHA VIRTUAL (Gerar Pagamento no Chat)
// ==========================================================
// Enviar cobrança (Vendedor no chat fazendo a venda)
router.post('/chats/send-payment', protect, requirePermission('WHATSAPP_SEND'), gerarCobrançaChat);


// ==========================================================
// 🤖 CONFIGURAÇÕES DE INTELIGÊNCIA ARTIFICIAL
// ==========================================================
router.get('/ai-config', protect, requirePermission('WHATSAPP_MANAGE'), getAiConfig);
router.put('/ai-config', protect, requirePermission('WHATSAPP_MANAGE'), updateAiConfig);

export default router;