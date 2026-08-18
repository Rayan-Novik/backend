import { getWhatsAppStatus, logoutWhatsApp, connectWhatsApp, getSession } from '../../services/whatsapp/connection.js';
import { sendWhatsAppMessage } from '../../services/whatsapp/sender.js';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const getAiConfig = async (req, res) => {
    try {
        let config = await prisma.aiConfiguracoes.findUnique({
            where: { id_tenant: Number(req.tenantId) }
        });
        
        if (!config) {
            config = {
                ia_ativada: true,
                ia_auto_atendimento: false,
                nome_agente: 'Chico',
                personalidade: 'Simpático e Amigável',
                ramo_loja: 'Restaurante / Lanches',
                tempo_resposta: 2,
                provedor_ia: 'GROQ',
                groq_api_key: '',
                gemini_api_key: '',
                modo_apenas_agendamento: false
            };
        }
        res.json(config);
    } catch (error) {
        res.status(500).json({ error: "Erro ao buscar config IA" });
    }
};

// PUT /whatsapp/ai-config
export const updateAiConfig = async (req, res) => {
    try {
        const { 
            ia_ativada, 
            ia_auto_atendimento, 
            nome_agente, 
            personalidade, 
            ramo_loja, 
            tempo_resposta, 
            groq_api_key, 
            // 🟢 NOVOS CAMPOS ADICIONADOS PARA GRAVAR NO BANCO
            provedor_ia, 
            gemini_api_key,
            modo_apenas_agendamento
        } = req.body;
        
        const configAtualizada = await prisma.aiConfiguracoes.upsert({
            where: { id_tenant: Number(req.tenantId) },
            update: {
                ia_ativada,
                ia_auto_atendimento,
                nome_agente,
                personalidade,
                ramo_loja,
                tempo_resposta,
                groq_api_key,
                // 🟢 NOVOS CAMPOS AQUI
                provedor_ia, 
                gemini_api_key,
                modo_apenas_agendamento
            },
            create: {
                id_tenant: Number(req.tenantId),
                ia_ativada,
                ia_auto_atendimento,
                nome_agente,
                personalidade,
                ramo_loja,
                tempo_resposta,
                groq_api_key,
                // 🟢 NOVOS CAMPOS AQUI TAMBÉM
                provedor_ia, 
                gemini_api_key,
                modo_apenas_agendamento
            }
        });

        res.json(configAtualizada);
    } catch (error) {
        console.error("Erro ao atualizar config IA:", error);
        res.status(500).json({ error: "Erro ao atualizar config IA" });
    }
};

// 🟢 Pegamos o ID direto do Token JWT de quem fez a requisição
export const getStatus = (req, res) => {
    try {
        const id_tenant = String(req.tenantId);
        const statusInfo = getWhatsAppStatus(id_tenant); 
        res.status(200).json(statusInfo);
    } catch (error) {
        console.error('Erro ao obter status do WhatsApp:', error);
        res.status(500).json({ message: 'Erro ao buscar status do WhatsApp.' });
    }
};

export const connect = async (req, res) => {
    try {
        const id_tenant = String(req.tenantId);
        const { phone, forceNew } = req.body || {};

        if (forceNew) {
            const SESSIONS_DIR = path.resolve(process.cwd(), 'whatsapp_sessions');
            const authFolder = path.join(SESSIONS_DIR, `tenant_${id_tenant}`);

            if (fs.existsSync(authFolder)) {
                fs.rmSync(authFolder, { recursive: true, force: true });
                console.log(`🧹 [Tenant ${id_tenant}] Pasta de sessão antiga deletada para forçar novo código.`);
            }
            
            const session = getSession(id_tenant);
            if (session) {
                if (session.sock) {
                    try { session.sock.ws.close(); } catch(e){}
                    session.sock = null;
                }
                session.qr = null;
                session.pairingCode = null;
                session.status = 'DISCONNECTED';
            }
        } else {
            const statusInfo = getWhatsAppStatus(id_tenant);
            if (statusInfo.status === 'CONNECTED') {
                return res.status(400).json({ message: 'WhatsApp já conectado.' });
            }
        }

        await connectWhatsApp(id_tenant, phone);
        res.status(200).json({ message: 'Tentativa de conexão iniciada.' });
    } catch (error) {
        console.error('Erro ao conectar WhatsApp:', error);
        res.status(500).json({ message: 'Erro ao iniciar conexão.' });
    }
};

export const logout = async (req, res) => {
    try {
        const id_tenant = String(req.tenantId);
        await logoutWhatsApp(id_tenant);
        res.status(200).json({ message: 'WhatsApp desconectado com sucesso.' });
    } catch (error) {
        console.error('Erro ao desconectar WhatsApp:', error);
        res.status(500).json({ message: 'Erro ao tentar desconectar.' });
    }
};

export const sendMessage = async (req, res) => {
    try {
        const id_tenant = String(req.tenantId);
        const { phone, message } = req.body;

        if (!phone || !message) {
            return res.status(400).json({ message: 'Telefone e mensagem são obrigatórios.' });
        }

        const success = await sendWhatsAppMessage(phone, { text: message }, id_tenant);

        if (success) {
            res.status(200).json({ message: 'Mensagem enviada com sucesso!' });
        } else {
            res.status(400).json({ message: 'Falha ao enviar mensagem.' });
        }
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        res.status(500).json({ message: 'Erro interno ao enviar mensagem.' });
    }
};