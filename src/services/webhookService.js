import axios from 'axios';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

export const dispatchWebhook = async (id_tenant, evento, payload) => {
    try {
        // 1. Busca se o lojista configurou uma URL para esse evento
        const webhooks = await prisma.tenant_webhooks.findMany({
            where: { id_tenant, evento, ativo: true }
        });

        // 2. Dispara para todas as URLs cadastradas (Geralmente é só uma)
        for (const hook of webhooks) {
            console.log(`🚀 [Webhook] Enviando evento ${evento} para ${hook.url}`);
            
            // Envia via POST com os dados do pedido
            axios.post(hook.url, {
                evento,
                timestamp: new Date(),
                data: payload
            }, { 
                timeout: 5000,
                headers: { 'User-Agent': 'Ararinha-Webhook-Dispatcher' }
            }).catch(err => {
                console.error(`❌ [Webhook] Falha ao enviar para ${hook.url}:`, err.message);
            });
        }
    } catch (error) {
        console.error("Erro ao processar despacho de Webhook:", error);
    }
};