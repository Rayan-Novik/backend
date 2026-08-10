import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser, downloadMediaMessage } from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';

// 🟢 IMPORTAÇÃO DO MODELO DE CONFIGURAÇÕES E DA IA
import ConfiguracaoModel from '../../models/configuracaoModel.js';
import { processAudioWithGroq } from '../ai/groqService.js';
import { handleAIAttendance } from '../ai/agentFlow.js'; // 🟢 Importa o novo Orquestrador

const prisma = new PrismaClient();
const sessions = {};
const SESSIONS_DIR = path.resolve(process.cwd(), 'whatsapp_sessions');

if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

export const getSession = (id_tenant) => {
    if (!sessions[id_tenant]) {
        sessions[id_tenant] = {
            sock: null,
            qr: null,
            pairingCode: null,
            status: 'DISCONNECTED',
            configs: {
                receberGrupos: false,
                receberCanais: false,
                iaAtivada: true,
                iaAutoAtendimento: false,
                lastUpdate: 0
            }
        };
    }
    return sessions[id_tenant];
};

export const getWhatsAppStatus = (id_tenant) => {
    const session = getSession(id_tenant);
    return {
        status: session.status,
        qrCode: session.qr,
        pairingCode: session.pairingCode
    };
};

export const connectWhatsApp = async (id_tenant, phoneNumber = null) => {
    try {
        const session = getSession(id_tenant);
        const authFolder = path.join(SESSIONS_DIR, `tenant_${id_tenant}`);

        if (!fs.existsSync(authFolder)) {
            fs.mkdirSync(authFolder, { recursive: true });
        }

        const { state, saveCreds } = await useMultiFileAuthState(authFolder);
        const { version, isLatest } = await fetchLatestBaileysVersion();

        console.log(`📡 [Tenant ${id_tenant}] Iniciando WhatsApp v${version.join('.')}...`);

        const sock = makeWASocket({
            version,
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: ['Ubuntu', 'Chrome', '20.0.04'],
            syncFullHistory: false,
            generateHighQualityLinkPreview: true,
            getMessage: async (key) => {
                return { conversation: 'Mensagem antiga' };
            }
        });

        let pairingCodeRequested = false;

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                if (phoneNumber && !sock.authState.creds.registered && !pairingCodeRequested) {
                    pairingCodeRequested = true;
                    try {
                        let numberLimpo = String(phoneNumber).replace(/\D/g, '');
                        if (!numberLimpo.startsWith('55')) numberLimpo = '55' + numberLimpo;

                        console.log(`⏳ [Tenant ${id_tenant}] Solicitando código para o número: ${numberLimpo}`);
                        const code = await sock.requestPairingCode(numberLimpo);
                        session.pairingCode = code?.match(/.{1,4}/g)?.join('-') || code;
                        session.status = 'WAITING_FOR_CODE';
                        console.log(`🔢 [Tenant ${id_tenant}] Código gerado: ${session.pairingCode}`);
                    } catch (err) {
                        console.error(`❌ [Tenant ${id_tenant}] Erro ao gerar código:`, err);
                        session.status = 'DISCONNECTED';
                    }
                }
                else if (!phoneNumber) {
                    try {
                        session.qr = await QRCode.toDataURL(qr);
                        session.status = 'WAITING_FOR_SCAN';
                        console.log(`🔄 [Tenant ${id_tenant}] Novo QR Code gerado.`);
                    } catch (err) {
                        console.error(`[Tenant ${id_tenant}] Erro ao gerar QR Code:`, err);
                    }
                }
            }

            if (connection === 'close') {
                session.qr = null;
                session.pairingCode = null;
                session.status = 'DISCONNECTED';
                pairingCodeRequested = false;

                const statusCode = lastDisconnect.error?.output?.statusCode;
                const isCorruptedSession = statusCode === 405 || statusCode === 401 || statusCode === DisconnectReason.loggedOut;

                const wasConnected = !!sock.authState?.creds?.me || !!sock.authState?.creds?.registered;
                const shouldReconnect = !isCorruptedSession && wasConnected;

                console.log(`⚠️ [Tenant ${id_tenant}] Conexão fechada. (Status Code: ${statusCode}) Reconectando: ${shouldReconnect}`);

                if (shouldReconnect) {
                    setTimeout(() => connectWhatsApp(id_tenant, phoneNumber), 5000);
                } else {
                    console.log(`🛑 [Tenant ${id_tenant}] Sessão pendente, recusada ou deslogada. Parando tentativas.`);

                    if (fs.existsSync(authFolder)) {
                        fs.rmSync(authFolder, { recursive: true, force: true });
                        console.log(`🧹 [Tenant ${id_tenant}] Arquivos temporários deletados em: ${authFolder}`);
                    }

                    try { sock.ws.close(); } catch (e) { }
                    session.sock = null;
                }
            } else if (connection === 'open') {
                session.qr = null;
                session.pairingCode = null;
                session.status = 'CONNECTED';
                console.log(`✅ [Tenant ${id_tenant}] WhatsApp conectado!`);
            }
        });

        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify' && type !== 'append') return;

            const now = Date.now();
            if (now - session.configs.lastUpdate > 300000 || session.configs.lastUpdate === 0) {
                try {
                    // 🟢 BUSCA AS CONFIGURAÇÕES ATUALIZADAS DO NOVO MODEL
                    const config = await prisma.aiConfiguracoes.findUnique({
                        where: { id_tenant: Number(id_tenant) }
                    });

                    // Se existir config, atualiza as flags de controle
                    if (config) {
                        session.configs.iaAtivada = config.ia_ativada;
                        session.configs.iaAutoAtendimento = config.ia_auto_atendimento;
                    } else {
                        // Padrão caso não exista ainda
                        session.configs.iaAtivada = true;
                        session.configs.iaAutoAtendimento = false;
                    }

                    // Mantém as de grupos/canais que você já tinha
                    const receberGrupos = await ConfiguracaoModel.get('WHATSAPP_RECEBER_GRUPOS', Number(id_tenant));
                    const receberCanais = await ConfiguracaoModel.get('WHATSAPP_RECEBER_CANAIS', Number(id_tenant));

                    session.configs.receberGrupos = receberGrupos === 'true';
                    session.configs.receberCanais = receberCanais === 'true';
                    session.configs.lastUpdate = now;
                } catch (err) {
                    console.log("⚠️ Erro ao buscar configurações de IA:", err);
                }
            }
            for (const msg of messages) {
                try {
                    if (!msg.message || msg.key.remoteJid === 'status@broadcast') continue;

                    const remoteJid = msg.key.remoteJid;

                    if (remoteJid.endsWith('@g.us') && !session.configs.receberGrupos) continue;
                    if (remoteJid.endsWith('@newsletter') && !session.configs.receberCanais) continue;

                    const fromMe = msg.key.fromMe;
                    const whatsappId = msg.key.id;

                    const isRevoke = msg.message?.protocolMessage?.type === 0 || msg.message?.protocolMessage?.type === 'REVOKE';
                    if (isRevoke) {
                        const keyApagada = msg.message.protocolMessage.key;
                        if (keyApagada && keyApagada.id) {
                            await prisma.whatsappMensagens.updateMany({
                                where: {
                                    whatsappId: keyApagada.id,
                                    id_tenant: Number(id_tenant)
                                },
                                data: {
                                    conteudo: '🚫 Esta mensagem foi apagada',
                                    tipo: 'deleted'
                                }
                            });
                        }
                        continue;
                    }

                    let conteudo = '[Mensagem não suportada]';
                    let msgType = 'text';

                    let coreMessage = msg.message;

                    if (coreMessage.deviceSentMessage) coreMessage = coreMessage.deviceSentMessage.message;
                    if (coreMessage.ephemeralMessage) coreMessage = coreMessage.ephemeralMessage.message;
                    if (coreMessage.documentWithCaptionMessage) coreMessage = coreMessage.documentWithCaptionMessage.message;

                    const mainType = Object.keys(coreMessage)[0];

                    if (mainType === 'viewOnceMessageV2' || mainType === 'viewOnceMessageV2Extension' || mainType === 'viewOnceMessage') {
                        conteudo = '👁️ Mídia de visualização única';
                        msgType = 'view_once';
                    }
                    else if (mainType === 'conversation') {
                        conteudo = coreMessage.conversation;
                    }
                    else if (mainType === 'extendedTextMessage') {
                        conteudo = coreMessage.extendedTextMessage.text;
                    }
                    else if (mainType === 'audioMessage') {
                        msgType = 'audio';
                        try {
                            const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                            const fileName = `audio_${whatsappId}.ogg`;
                            const tenantFolder = `tenant_${id_tenant}`;
                            const uploadDir = path.join(process.cwd(), 'uploads', tenantFolder, 'audios');

                            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

                            const fullPath = path.join(uploadDir, fileName);
                            fs.writeFileSync(fullPath, buffer);
                            conteudo = `/uploads/${tenantFolder}/audios/${fileName}`;

                            try {
                                const transcricao = await processAudioWithGroq(fullPath);
                                conteudo = `${conteudo}\n[IA]: ${transcricao}`;
                                console.log(`🗣️ [Tenant ${id_tenant}] Áudio recebido e transcrito: "${transcricao}"`);
                            } catch (iaErr) {
                                console.error("⚠️ Erro ao transcrever áudio recebido:", iaErr);
                            }

                        } catch (err) {
                            console.error(`❌ [Tenant ${id_tenant}] Erro ao baixar áudio:`, err);
                            conteudo = '[Erro ao carregar áudio]';
                        }
                    }
                    else if (mainType === 'imageMessage') {
                        msgType = 'image';
                        try {
                            const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                            const fileName = `img_${whatsappId}.jpg`;
                            const tenantFolder = `tenant_${id_tenant}`;
                            const uploadDir = path.join(process.cwd(), 'uploads', tenantFolder, 'imagens');

                            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
                            fs.writeFileSync(path.join(uploadDir, fileName), buffer);

                            const legenda = coreMessage.imageMessage.caption || '';
                            const fileUrl = `/uploads/${tenantFolder}/imagens/${fileName}`;
                            conteudo = legenda ? `${fileUrl}\n${legenda}` : fileUrl;
                        } catch (err) {
                            conteudo = '[Erro ao carregar imagem]';
                        }
                    }
                    else if (mainType === 'videoMessage') {
                        msgType = 'video';
                        try {
                            const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                            const fileName = `vid_${whatsappId}.mp4`;
                            const tenantFolder = `tenant_${id_tenant}`;
                            const uploadDir = path.join(process.cwd(), 'uploads', tenantFolder, 'videos');

                            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
                            fs.writeFileSync(path.join(uploadDir, fileName), buffer);

                            const legenda = coreMessage.videoMessage.caption || '';
                            const fileUrl = `/uploads/${tenantFolder}/videos/${fileName}`;
                            conteudo = legenda ? `${fileUrl}\n${legenda}` : fileUrl;
                        } catch (err) {
                            conteudo = '[Erro ao carregar vídeo]';
                        }
                    }
                    else if (mainType === 'documentMessage') {
                        msgType = 'document';
                        try {
                            const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                            const fileName = coreMessage.documentMessage.fileName || `doc_${whatsappId}.pdf`;
                            const tenantFolder = `tenant_${id_tenant}`;
                            const uploadDir = path.join(process.cwd(), 'uploads', tenantFolder, 'documentos');

                            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
                            fs.writeFileSync(path.join(uploadDir, fileName), buffer);

                            const fileUrl = `/uploads/${tenantFolder}/documentos/${fileName}`;
                            conteudo = `[Documento] ${fileUrl}`;
                        } catch (err) {
                            conteudo = '[Erro ao carregar documento]';
                        }
                    }
                    else if (mainType === 'stickerMessage') {
                        conteudo = '🎴 [Figurinha recebida]';
                        msgType = 'text';
                    }

                    let pictureUrl = null;
                    try { pictureUrl = await sock.profilePictureUrl(remoteJid, 'image'); } catch (err) { }

                    let nomeParaSalvar = remoteJid.split('@')[0];
                    let updateData = {};
                    if (pictureUrl) updateData.pictureUrl = pictureUrl;
                    if (!fromMe && msg.pushName) {
                        nomeParaSalvar = msg.pushName;
                        updateData.nome = msg.pushName;
                    }

                    // 🟢 MÁGICA DA TRANSFERÊNCIA E AUTO-ATENDIMENTO AQUI:
                    let contatoDb = await prisma.whatsappContatos.findUnique({
                        where: { jid_id_tenant: { jid: remoteJid, id_tenant: Number(id_tenant) } }
                    });

                    let statusFinal = contatoDb ? contatoDb.status : 'pendentes';

                    // 🟢 Se estiver configurado para IA, avalia se precisa mudar para 'bot'
                    if (session.configs.iaAutoAtendimento && !fromMe) {
                        if (!contatoDb || statusFinal === 'pendentes' || statusFinal === 'arquivados') {
                            statusFinal = 'bot';
                        }
                    }

                    // 🟢 Garante que o statusFinal seja aplicado ao objeto de atualização
                    updateData.status = statusFinal;

                    const contatoAtualizado = await prisma.whatsappContatos.upsert({
                        where: { jid_id_tenant: { jid: remoteJid, id_tenant: Number(id_tenant) } },
                        update: updateData,
                        create: {
                            jid: remoteJid,
                            id_tenant: Number(id_tenant),
                            nome: nomeParaSalvar,
                            pictureUrl: pictureUrl,
                            status: statusFinal
                        }
                    });

                    await prisma.whatsappMensagens.upsert({
                        where: { whatsappId_id_tenant: { whatsappId: whatsappId, id_tenant: Number(id_tenant) } },
                        update: {},
                        create: {
                            id_tenant: Number(id_tenant),
                            remoteJid: remoteJid,
                            conteudo: conteudo,
                            fromMe: fromMe,
                            tipo: msgType,
                            data_envio: new Date(msg.messageTimestamp * 1000),
                            lida: fromMe,
                            whatsappId: whatsappId
                        }
                    });

                    // ========================================================
                    // 🧠 4. ATIVAÇÃO DO AGENTE IA AUTÔNOMO 
                    // ========================================================
                    if (!fromMe && contatoAtualizado.status === 'bot' && session.configs.iaAtivada) {
                        let textoCliente = '';

                        if (msgType === 'text') {
                            textoCliente = conteudo;
                        } else if (msgType === 'audio' && conteudo.includes('[IA]:')) {
                            textoCliente = conteudo.split('[IA]:')[1].trim();
                        }

                        if (textoCliente) {
                            await handleAIAttendance(remoteJid, Number(id_tenant), textoCliente);
                        }
                    }

                } catch (errorFatalMsg) {
                    console.error(`⚠️ [Tenant ${id_tenant}] AVISO: Mensagem ${msg?.key?.id} ignorada devido a erro:`, errorFatalMsg.message);
                }
            }
        });

        sock.ev.on('creds.update', saveCreds);
        session.sock = sock;
    } catch (error) {
        console.error(`❌ [Tenant ${id_tenant}] Erro fatal ao iniciar o WhatsApp:`, error);
    }
};

export const logoutWhatsApp = async (id_tenant) => {
    const session = getSession(id_tenant);
    const authFolder = path.join(SESSIONS_DIR, `tenant_${id_tenant}`);

    if (session.sock) {
        try { await session.sock.logout(); } catch (err) { }
        session.sock = null;
    }

    session.qr = null;
    session.pairingCode = null;
    session.status = 'DISCONNECTED';

    if (fs.existsSync(authFolder)) {
        fs.rmSync(authFolder, { recursive: true, force: true });
        console.log(`🧹 [Tenant ${id_tenant}] Pasta de sessão limpa.`);
    }
};

export const restoreWhatsAppSessions = async () => {
    console.log('🔄 [Auto-Boot] Procurando sessões salvas do WhatsApp...');

    if (!fs.existsSync(SESSIONS_DIR)) {
        console.log('ℹ️ Nenhuma pasta de sessões encontrada para restaurar.');
        return;
    }

    const folders = fs.readdirSync(SESSIONS_DIR);

    for (const folder of folders) {
        if (folder.startsWith('tenant_')) {
            const id_tenant = folder.split('_')[1];
            const authFolder = path.join(SESSIONS_DIR, folder);
            const credsPath = path.join(authFolder, 'creds.json');

            if (fs.existsSync(credsPath)) {
                console.log(`🔌 [Auto-Boot] Restaurando sessão do Tenant ${id_tenant}...`);
                connectWhatsApp(id_tenant);

                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                console.log(`🗑️ [Auto-Boot] Removendo pasta lixo do Tenant ${id_tenant}...`);
                fs.rmSync(authFolder, { recursive: true, force: true });
            }
        }
    }
};

export const limparTudoDoTenant = async (id_tenant, mode, date) => {
    return await prisma.$transaction(async (tx) => {
        const whereClause = { id_tenant: Number(id_tenant) };

        // Se o modo for por data, apaga apenas mensagens ANTES dessa data
        if (mode === 'date' && date) {
            whereClause.data_envio = { lt: new Date(date) };
        }

        const deletadasMsg = await tx.whatsappMensagens.deleteMany({ where: whereClause });

        // Só apaga os contatos se for para "Apagar TUDO"
        let deletadosContatos = { count: 0 };
        if (mode === 'all') {
            deletadosContatos = await tx.whatsappContatos.deleteMany({ where: { id_tenant: Number(id_tenant) } });
        }

        return { mensagens: deletadasMsg.count, contatos: deletadosContatos.count };
    });
};