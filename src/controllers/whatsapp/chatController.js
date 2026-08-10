import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { sendCRMMessage, deleteWhatsAppMessage, editWhatsAppMessage } from '../../services/whatsapp/sender.js';
import { sendImage, sendVideo, sendDocument, sendAudio, sendContact } from '../../services/whatsapp/mediaSender.js';
import { getSession, limparTudoDoTenant } from '../../services/whatsapp/connection.js';

// 🟢 IMPORTAÇÃO DO SERVIÇO DE IA (Somente Áudio)
import { processAudioWithGroq } from '../../services/ai/groqService.js';

const prisma = new PrismaClient();

// 🟢 Movi para o topo para evitar erro de inicialização no JavaScript
const deletePhysicalFile = (conteudo) => {
    if (!conteudo) return;

    // Extrai o caminho: remove tags entre [] e espaços
    const relativePath = conteudo.replace(/\[.*?\]/g, '').trim();

    // Verifica se é um caminho de upload local
    if (relativePath.startsWith('/uploads/')) {
        const fullPath = path.join(process.cwd(), relativePath);
        
        if (fs.existsSync(fullPath)) {
            try {
                fs.unlinkSync(fullPath);
                console.log(`✅ Arquivo deletado fisicamente: ${fullPath}`);
            } catch (err) {
                console.error(`❌ Erro ao deletar arquivo físico: ${err.message}`);
            }
        }
    }
};

export const getChats = async (req, res) => {
    try {
        const id_tenant = Number(req.tenantId);
        
        const contatos = await prisma.whatsappContatos.findMany({
            where: { id_tenant },
            include: {
                mensagens: {
                    orderBy: { data_envio: 'desc' },
                    take: 1 // Pega só a última mensagem pra exibir na lista
                }
            }
        });

        // Formata bonitinho pro Frontend e converte a data para timestamp numérico
        const chats = contatos.map(c => {
            const dataUltimaMensagem = c.mensagens[0]?.data_envio || c.createdAt;
            
            return {
                jid: c.jid,
                nome: c.nome,
                foto: c.pictureUrl,
                ultimaMensagem: c.mensagens[0]?.conteudo || '',
                dataUltima: new Date(dataUltimaMensagem).getTime(), 
                naoLidas: 0,
                status: c.status || 'atendimento',
                responsavelId: c.responsavelId // 🟢 AQUI ESTÁ A MÁGICA QUE FALTAVA!
            };
        }).sort((a, b) => b.dataUltima - a.dataUltima);

        res.json(chats);
    } catch (error) {
        console.error('Erro ao buscar chats:', error);
        res.status(500).json({ message: 'Erro ao buscar conversas.' });
    }
};

// 🟢 Rota para atualizar status (Arquivar, Pendentes, etc)
export const updateChatStatus = async (req, res) => {
    try {
        const id_tenant = Number(req.tenantId);
        const { jid } = req.params;
        const { status, responsavelId } = req.body; 

        // Monta os dados que vão pro banco dinamicamente
        const dataToUpdate = { status: status };

        // Só atualiza o dono se o Frontend enviar esse dado na requisição
        if (responsavelId !== undefined) {
            // Se for transferido pra fila de pendentes, pode ser que você queira mandar null
            dataToUpdate.responsavelId = responsavelId === null ? null : Number(responsavelId);
        }

        await prisma.whatsappContatos.updateMany({
            where: { jid: jid, id_tenant: id_tenant },
            data: dataToUpdate
        });

        res.json({ message: `Status atualizado com sucesso.` });
    } catch (error) {
        console.error('Erro ao atualizar status:', error);
        res.status(500).json({ message: 'Erro interno ao atualizar status.' });
    }
};

// 🟢 Busca o histórico completo de uma conversa quando clica no contato
export const getMessagesByJid = async (req, res) => {
    try {
        const id_tenant = Number(req.tenantId);
        const { jid } = req.params;

        const mensagens = await prisma.whatsappMensagens.findMany({
            where: { 
                id_tenant: id_tenant,
                remoteJid: jid
            },
            orderBy: { data_envio: 'asc' } 
        });

        res.json(mensagens);
    } catch (error) {
        console.error('Erro ao buscar mensagens:', error);
        res.status(500).json({ message: 'Erro ao buscar mensagens.' });
    }
};

export const sendChatMessage = async (req, res) => {
    try {
        const id_tenant = Number(req.tenantId);
        const { phone, message } = req.body;

        if (!phone || !message) return res.status(400).json({ message: 'Dados inválidos.' });

        const sentMsg = await sendCRMMessage(phone, { text: message }, id_tenant);

        // Se o zap enviou com sucesso, a variável sentMsg vai ter a key.id
        if (sentMsg && sentMsg.key) {
            
            // 🟢 SALVA A MENSAGEM NO BANCO IMEDIATAMENTE!
            await prisma.whatsappMensagens.upsert({
                where: { 
                    whatsappId_id_tenant: { whatsappId: sentMsg.key.id, id_tenant: id_tenant } 
                },
                update: {},
                create: {
                    id_tenant: id_tenant,
                    remoteJid: phone,
                    conteudo: message,
                    fromMe: true,
                    tipo: 'text',
                    data_envio: new Date(),
                    lida: true, // Já que foi você que mandou, já está lida
                    whatsappId: sentMsg.key.id
                }
            });

            res.json({ message: 'Enviada' });
        } else {
            res.status(400).json({ message: 'Falha no envio.' });
        }
    } catch (error) {
        console.error('Erro ao enviar pelo chat:', error);
        res.status(500).json({ message: 'Erro interno.' });
    }
};

// 🟢 DELETAR Mensagem
export const deleteMessage = async (req, res) => {
    try {
        const id_tenant = Number(req.tenantId);
        const { jid, messageId } = req.params;

        // 1. BUSCA A MENSAGEM ANTES DE APAGAR para saber se tem arquivo
        const message = await prisma.whatsappMensagens.findFirst({
            where: { whatsappId: messageId, id_tenant: id_tenant }
        });

        if (!message) {
            return res.status(404).json({ message: 'Mensagem não encontrada.' });
        }

        // 2. APAGAR NO WHATSAPP REAL
        const session = getSession(id_tenant);
        if (session && session.sock) {
            try {
                await session.sock.sendMessage(jid, { 
                    delete: { 
                        remoteJid: jid, 
                        fromMe: true, 
                        id: messageId 
                    } 
                });
            } catch (wsError) {
                console.error(`⚠️ [Tenant ${id_tenant}] Falha no comando de delete WhatsApp:`, wsError.message);
            }
        }

        // 3. 🟢 EXCLUSÃO FÍSICA DO ARQUIVO (Imagens, Vídeos, Áudios, Docs)
        if (message.tipo !== 'text' && message.tipo !== 'deleted') {
            deletePhysicalFile(message.conteudo);
        }

        // 4. SOFT DELETE NO BANCO
        await prisma.whatsappMensagens.updateMany({
            where: { whatsappId: messageId, id_tenant: id_tenant },
            data: {
                conteudo: '🚫 Esta mensagem foi apagada',
                tipo: 'deleted' 
            }
        });

        return res.json({ message: 'Mensagem e arquivos removidos com sucesso.' });

    } catch (error) {
        console.error(`❌ Erro ao deletar mensagem:`, error);
        return res.status(500).json({ message: 'Erro interno.' });
    }
};

// 🟢 EDITAR Mensagem
export const editMessage = async (req, res) => {
    try {
        const id_tenant = Number(req.tenantId);
        const { jid, messageId } = req.params;
        const { newText } = req.body;

        // Busca antes para verificar se era mídia
        const oldMessage = await prisma.whatsappMensagens.findFirst({
            where: { whatsappId: messageId, id_tenant }
        });

        const success = await editWhatsAppMessage(id_tenant, jid, messageId, newText);

        if (success) {
            // Se a mensagem antiga tinha arquivo e agora virou texto/editada
            if (oldMessage && oldMessage.tipo !== 'text' && oldMessage.tipo !== 'deleted') {
                deletePhysicalFile(oldMessage.conteudo);
            }

            // Atualiza o conteúdo e marca como editada
            await prisma.whatsappMensagens.updateMany({
                where: { whatsappId: messageId, id_tenant },
                data: { 
                    conteudo: newText,
                    tipo: 'edited' 
                }
            });
            res.json({ message: 'Editada com sucesso.' });
        } else {
            res.status(400).json({ message: 'Não foi possível editar.' });
        }
    } catch (error) {
        console.error('Erro ao editar:', error);
        res.status(500).json({ message: 'Erro interno.' });
    }
};

export const sendMediaMessage = async (req, res) => {
    try {
        const id_tenant = Number(req.tenantId);
        const { phone, caption, isVoiceNote } = req.body;
        const file = req.file;

        if (!phone || !file) {
            return res.status(400).json({ message: 'Número e arquivo são obrigatórios.' });
        }

        let sentMsg;
        let msgType = 'document';
        let conteudoDb = '';

        const mediaSource = file.buffer;
        const tenantFolder = `tenant_${id_tenant}`;
        const ext = path.extname(file.originalname) || '';
        const fileName = `enviado_${Date.now()}${ext}`; 
        const uploadDir = path.join(process.cwd(), 'uploads', tenantFolder, 'enviados');

        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        fs.writeFileSync(path.join(uploadDir, fileName), mediaSource);
        const fileUrlDb = `/uploads/${tenantFolder}/enviados/${fileName}`;

        if (file.mimetype.startsWith('image/')) {
            sentMsg = await sendImage(id_tenant, phone, mediaSource, caption);
            msgType = 'image';
            conteudoDb = caption ? `${fileUrlDb}\n${caption}` : fileUrlDb;
        }
        else if (file.mimetype.startsWith('video/')) {
            sentMsg = await sendVideo(id_tenant, phone, mediaSource, caption);
            msgType = 'video';
            conteudoDb = caption ? `${fileUrlDb}\n${caption}` : fileUrlDb;
        }
        else if (file.mimetype.startsWith('audio/')) {
            const voiceNote = isVoiceNote === 'true'; 
            sentMsg = await sendAudio(id_tenant, phone, mediaSource, voiceNote);
            msgType = 'audio';
            conteudoDb = fileUrlDb; 
        }
        else {
            sentMsg = await sendDocument(id_tenant, phone, mediaSource, file.originalname, file.mimetype, caption);
            msgType = 'document';
            conteudoDb = caption ? `${fileUrlDb}\n${caption}` : `[Documento] ${fileUrlDb}`;
        }

        if (sentMsg && sentMsg.key) {
            await prisma.whatsappMensagens.upsert({
                where: { 
                    whatsappId_id_tenant: { whatsappId: sentMsg.key.id, id_tenant: id_tenant } 
                },
                update: {},
                create: {
                    id_tenant: id_tenant,
                    remoteJid: phone,
                    conteudo: conteudoDb, 
                    fromMe: true,
                    tipo: msgType,
                    data_envio: new Date(),
                    lida: true,
                    whatsappId: sentMsg.key.id
                }
            });

            return res.json({ message: 'Mídia enviada e salva com sucesso', id: sentMsg.key.id, url: fileUrlDb });
        } else {
            return res.status(400).json({ message: 'Falha ao enviar a mídia pelo WhatsApp.' });
        }
    } catch (error) {
        console.error('Erro ao enviar mídia:', error);
        res.status(500).json({ message: 'Erro interno.' });
    }
};

// 🟢 FUNÇÃO DA INTELIGÊNCIA ARTIFICIAL (Somente Áudio)
export const analyzeMediaMessage = async (req, res) => {
    try {
        const id_tenant = Number(req.tenantId);
        const { messageId } = req.params;

        // 1. Busca a mensagem no banco
        const message = await prisma.whatsappMensagens.findFirst({
            where: { whatsappId: messageId, id_tenant: id_tenant }
        });

        if (!message || message.tipo !== 'audio') {
            return res.status(400).json({ message: 'Mensagem inválida ou não é um áudio suportado pela IA.' });
        }

        // 🟢 O PULO DO GATO: Se a mensagem já tiver a transcrição salva, devolve direto!
        if (message.conteudo.includes('[IA]:')) {
            const savedTranscription = message.conteudo.split('[IA]:')[1].trim();
            console.log(`⚡ [Cache] Transcrição já salva no banco recuperada.`);
            return res.json({ result: savedTranscription });
        }

        // 2. Extrai o caminho físico do arquivo (Ignora qualquer texto adicional)
        const relativePath = message.conteudo.replace(/\[.*?\]/g, '').trim().split('\n')[0];
        
        if (!relativePath.startsWith('/uploads/')) {
            return res.status(400).json({ message: 'Arquivo de áudio não encontrado no servidor.' });
        }

        const fullPath = path.join(process.cwd(), relativePath);
        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ message: 'O arquivo de áudio físico não existe mais no servidor.' });
        }

        // 3. Processa na IA (Porque é a primeira vez)
        const aiResponse = await processAudioWithGroq(fullPath);

        // 🟢 SALVA O RESULTADO NO BANCO DEFINITIVAMENTE
        // Ele vai ficar assim: "/uploads/arquivo.ogg\n[IA]: Olá, tudo bem?"
        await prisma.whatsappMensagens.updateMany({
            where: { whatsappId: messageId, id_tenant: id_tenant },
            data: { 
                conteudo: `${message.conteudo}\n[IA]: ${aiResponse}` 
            }
        });
        
        return res.json({ result: aiResponse });

    } catch (error) {
        console.error('Erro na IA:', error);
        return res.status(500).json({ message: error.message || 'Erro ao processar áudio na IA.' });
    }
};

export const limparHistorico = async (req, res) => {
    try {
        const id_tenant = Number(req.tenantId);
        const { mode, date } = req.body; 
        
        await limparTudoDoTenant(id_tenant, mode, date);
        
        res.status(200).json({ message: "Histórico processado com sucesso!" });
    } catch (error) {
        console.error('Erro ao limpar histórico:', error);
        res.status(500).json({ message: "Erro ao limpar o histórico." });
    }
};