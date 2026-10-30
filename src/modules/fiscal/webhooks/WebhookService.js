import prisma from '../../../config/prisma.js';
import axios from 'axios';
import crypto from 'crypto';

export class WebhookService {
  static async disparar(tenant_id, estabelecimento_id, evento, payload) {
    try {
      const webhooks = await prisma.fiscal_webhooks.findMany({
        where: {
          tenant_id: String(tenant_id),
          ativo: true,
          OR: [
            { estabelecimento_id: null },
            { estabelecimento_id }
          ]
        }
      });

      for (const hook of webhooks) {
        const eventosInscritos = hook.eventos.split(',').map((e) => e.trim().toUpperCase());
        if (!eventosInscritos.includes(evento.toUpperCase()) && !eventosInscritos.includes('ALL')) {
          continue;
        }

        const data = {
          evento,
          timestamp: new Date().toISOString(),
          tenant_id: String(tenant_id),
          estabelecimento_id,
          payload
        };

        const headers = {
          'Content-Type': 'application/json'
        };

        if (hook.secret) {
          const signature = crypto.createHmac('sha256', hook.secret)
            .update(JSON.stringify(data))
            .digest('hex');
          headers['x-webhook-signature'] = signature;
        }

        axios.post(hook.url, data, { headers, timeout: 5000 }).catch(err => {
          console.error(`[WEBHOOK ERROR] Falha ao entregar evento ${evento} para ${hook.url}:`, err.message);
        });
      }
    } catch (e) {
      console.error('[WEBHOOK ERROR] Erro geral ao processar webhooks:', e);
    }
  }
}
