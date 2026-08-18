import { PrismaClient } from '@prisma/client';
import { encrypt, decrypt } from '../services/cryptoService.js';

const prisma = new PrismaClient();

const PLAINTEXT_KEYS = [
    'MERCADOPAGO_PUBLIC_KEY',
    'MERCADOPAGO_ACCESS_TOKEN',
    'ACTIVE_GATEWAY',      
    'STRIPE_PUBLIC_KEY',   
    'STRIPE_SECRET_KEY',    
    'ASAAS_API_KEY',
    'MERCADO_LIVRE_REFRESH_TOKEN',
    'MERCADO_LIVRE_SECRET_KEY',
    'MERCADO_LIVRE_APP_ID',
    'MERCADO_LIVRE_ACCESS_TOKEN',
    'CIELO_MERCHANT_ID',
    'CIELO_MERCHANT_KEY',
    'CIELO_SANDBOX',
    'pix_desconto_ativo',
    'pix_desconto_porcentagem',
    'SITE_TITLE',
    'LOGO_URL', 
    'FAVICON_URL',
    'HOMEPAGE_LAYOUT',
    'BODY_BG_COLOR',
    'SITE_TEXT_COLOR',
    'BTN_PRIMARY_BG',
    'BTN_PRIMARY_TEXT',
    'HEADER_PRIMARY_COLOR',
    'HEADER_SECONDARY_COLOR',
    'FOOTER_COLOR',
    'IMGBB_API_KEY',
    'UPLOAD_PROVIDER',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'AGENT_SYSTEM_PROMPT',
    'AGENT_MODEL',
    'AGENT_TEMPERATURE',
    'STORE_LAYOUT_STYLE',
    
    // 🟢 CAMPOS DE E-MAIL
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_SECURE',
    'SMTP_FROM_NAME',
    'SMTP_FROM_EMAIL',
    'SMTP_SIGNATURE_IMAGE',
    'SMTP_SIGNATURE',
    'RETIRADA_ATIVA',
    'CONSUMO_LOCAL_ATIVO',

    // 🟢 NOVOS CAMPOS DE CONTROLE DO WHATSAPP
    'WHATSAPP_RECEBER_GRUPOS',
    'WHATSAPP_RECEBER_CANAIS',
];

const ConfiguracaoModel = {     
    get: async (chave, id_tenant) => {
        try {
            const config = await prisma.configuracoes.findFirst({
                where: { 
                    chave: chave,
                    id_tenant: id_tenant 
                }
            });

            if (config) {
                const valor = config.valor;
                
                if (PLAINTEXT_KEYS.includes(chave)) {
                    return valor; 
                }
                
                // 🛡️ Impede tentar descriptografar textos que já estão vazios
                if (valor === "") return "";
                
                return decrypt(valor); 
            }
            return null;
        } catch (error) {
            console.error(`Erro ao buscar configuração ${chave}:`, error);
            return null;
        }
    },

    set: async (chave, valor, id_tenant) => {
        try {
            // 🛡️ BLINDAGEM ANTI-NULL: Garante que o valor sempre será um texto (mesmo se vier vazio)
            const valorSeguro = (valor !== null && valor !== undefined) ? String(valor) : "";
            
            let valorFinal = ""; // Começa com uma string vazia garantida
            
            // Verifica se a chave precisa ser criptografada ou não
            if (PLAINTEXT_KEYS.includes(chave)) {
                valorFinal = valorSeguro;
            } else {
                // 🟢 Só criptografa se a string não estiver vazia!
                // O ( ?? "" ) no final previne que o encrypt devolva null caso dê algum erro
                valorFinal = valorSeguro === "" ? "" : (encrypt(valorSeguro) ?? "");
            }

            // Busca se essa loja já tem essa configuração salva
            const existing = await prisma.configuracoes.findFirst({
                where: { 
                    chave: chave,
                    id_tenant: id_tenant
                }
            });

            // Se já existe, atualiza pelo ID (Isso previne o erro de Unique Constraint)
            if (existing) {
                await prisma.configuracoes.update({
                    where: { id: existing.id },
                    data: { valor: valorFinal }
                });
            } else {
                // Se não existe, cria uma nova
                await prisma.configuracoes.create({
                    data: { 
                        chave: chave, 
                        valor: valorFinal,
                        id_tenant: id_tenant
                    }
                });
            }
        } catch (error) {
            console.error(`Erro ao salvar configuração ${chave}:`, error);
            throw error;
        }
    }
};

export default ConfiguracaoModel;