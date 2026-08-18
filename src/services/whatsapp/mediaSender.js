import { getSession } from './connection.js';

// 🟢 FUNÇÃO AUXILIAR: Formatar o Número ou LID
const formatJid = (phoneOrJid) => {
    let jid = phoneOrJid;
    if (!String(jid).includes('@')) {
        let formattedPhone = String(phoneOrJid).replace(/\D/g, '');
        if (!formattedPhone.startsWith('55')) formattedPhone = '55' + formattedPhone;
        jid = `${formattedPhone}@s.whatsapp.net`;
    }
    return jid;
};

// ============================================================================
// 1. ENVIAR IMAGEM
// mediaSource pode ser: { url: 'https://site.com/foto.jpg' }, { url: './local/foto.jpg' } ou um Buffer
// ============================================================================
export const sendImage = async (id_tenant, phoneOrJid, mediaSource, caption = '') => {
    const session = getSession(id_tenant);
    if (!session || !session.sock || session.status !== 'CONNECTED') return false;

    try {
        const jid = formatJid(phoneOrJid);
        const result = await session.sock.sendMessage(jid, { 
            image: mediaSource, 
            caption: caption 
        });
        console.log(`🖼️ [Tenant ${id_tenant}] Imagem enviada para: ${jid}`);
        return result;
    } catch (error) {
        console.error(`❌ [Tenant ${id_tenant}] Erro ao enviar imagem:`, error);
        return false;
    }
};

// ============================================================================
// 2. ENVIAR VÍDEO
// ============================================================================
export const sendVideo = async (id_tenant, phoneOrJid, mediaSource, caption = '', isGif = false) => {
    const session = getSession(id_tenant);
    if (!session || !session.sock || session.status !== 'CONNECTED') return false;

    try {
        const jid = formatJid(phoneOrJid);
        const result = await session.sock.sendMessage(jid, { 
            video: mediaSource, 
            caption: caption,
            gifPlayback: isGif // Se true, o vídeo toca em loop e sem som igual GIF
        });
        console.log(`🎥 [Tenant ${id_tenant}] Vídeo/GIF enviado para: ${jid}`);
        return result;
    } catch (error) {
        console.error(`❌ [Tenant ${id_tenant}] Erro ao enviar vídeo:`, error);
        return false;
    }
};

// ============================================================================
// 3. ENVIAR DOCUMENTO (PDF, DOCX, ZIP, PLANILHAS)
// 🟢 CORREÇÃO: Adicionado o "caption" nos parâmetros e no envio do sock
// ============================================================================
export const sendDocument = async (id_tenant, phoneOrJid, mediaSource, fileName, mimetype, caption = '') => {
    const session = getSession(id_tenant);
    if (!session || !session.sock || session.status !== 'CONNECTED') return false;

    try {
        const jid = formatJid(phoneOrJid);
        const result = await session.sock.sendMessage(jid, { 
            document: mediaSource, 
            fileName: fileName,
            mimetype: mimetype,
            caption: caption // 🟢 Isso faz o texto ir junto com o PDF/Doc no WhatsApp
        });
        console.log(`📄 [Tenant ${id_tenant}] Documento (${fileName}) enviado para: ${jid}`);
        return result;
    } catch (error) {
        console.error(`❌ [Tenant ${id_tenant}] Erro ao enviar documento:`, error);
        return false;
    }
};

// ============================================================================
// 4. ENVIAR ÁUDIO (MÚSICA OU MENSAGEM DE VOZ)
// Se isVoiceNote for true, ele vai aparecer como se você estivesse gravando um áudio
// ============================================================================
export const sendAudio = async (id_tenant, phoneOrJid, mediaSource, isVoiceNote = true) => {
    const session = getSession(id_tenant);
    if (!session || !session.sock || session.status !== 'CONNECTED') return false;

    try {
        const jid = formatJid(phoneOrJid);
        const result = await session.sock.sendMessage(jid, { 
            audio: mediaSource, 
            mimetype: 'audio/mp4', // Padrão WhatsApp
            ptt: isVoiceNote // PTT (Push-To-Talk) faz o áudio virar "Mensagem de Voz" (o microfone verdezinho)
        });
        console.log(`🎵 [Tenant ${id_tenant}] Áudio enviado para: ${jid}`);
        return result;
    } catch (error) {
        console.error(`❌ [Tenant ${id_tenant}] Erro ao enviar áudio:`, error);
        return false;
    }
};

// ============================================================================
// 5. ENVIAR CONTATO (CARTÃO vCard)
// ============================================================================
export const sendContact = async (id_tenant, phoneOrJid, contactName, contactNumber) => {
    const session = getSession(id_tenant);
    if (!session || !session.sock || session.status !== 'CONNECTED') return false;

    try {
        const jid = formatJid(phoneOrJid);
        
        // Formata o número pra colocar dentro do vCard
        let cleanNumber = String(contactNumber).replace(/\D/g, '');
        if (!cleanNumber.startsWith('55')) cleanNumber = '55' + cleanNumber;

        // O vCard é o formato oficial de contatos
        const vcard = 'BEGIN:VCARD\n' 
            + 'VERSION:3.0\n' 
            + `FN:${contactName}\n` // Nome completo
            + `TEL;type=CELL;type=VOICE;waid=${cleanNumber}:+${cleanNumber}\n` // Número linkado ao WhatsApp
            + 'END:VCARD';

        const result = await session.sock.sendMessage(jid, { 
            contacts: { 
                displayName: contactName, 
                contacts: [{ vcard }] 
            }
        });

        console.log(`👤 [Tenant ${id_tenant}] Contato (${contactName}) enviado para: ${jid}`);
        return result;
    } catch (error) {
        console.error(`❌ [Tenant ${id_tenant}] Erro ao enviar contato:`, error);
        return false;
    }
};