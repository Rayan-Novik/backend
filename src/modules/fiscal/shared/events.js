import { EventEmitter } from 'events';
import prisma from '../../../config/prisma.js';
import { WebhookService } from '../webhooks/WebhookService.js';

class FiscalEventEmitter extends EventEmitter {}

export const fiscalEvents = new FiscalEventEmitter();

fiscalEvents.on('onNotaAutorizada', async (data) => {
  try {
    const nota = await prisma.fiscal_notas.findUnique({ where: { id: data.nota_id } });
    if (nota) {
      await WebhookService.disparar(data.tenant_id, nota.estabelecimento_id, 'NFE_AUTORIZADA', {
        nota_id: data.nota_id,
        chave_acesso: data.chave_acesso,
        numero: nota.numero
      });
    }
  } catch (e) {
    console.error(e);
  }
});

fiscalEvents.on('onNotaCancelada', async (data) => {
  try {
    const nota = await prisma.fiscal_notas.findUnique({ where: { id: data.nota_id } });
    if (nota) {
      await WebhookService.disparar(data.tenant_id, nota.estabelecimento_id, 'NFE_CANCELADA', {
        nota_id: data.nota_id,
        chave_acesso: data.chave_acesso,
        numero: nota.numero
      });
    }
  } catch (e) {
    console.error(e);
  }
});

fiscalEvents.on('onEventoRegistrado', async (data) => {
  try {
    const nota = await prisma.fiscal_notas.findUnique({ where: { id: data.nota_id } });
    if (nota) {
      await WebhookService.disparar(data.tenant_id, nota.estabelecimento_id, data.tipo, {
        nota_id: data.nota_id,
        chave_acesso: nota.chave_acesso,
        numero: nota.numero,
        protocolo: data.protocolo
      });
    }
  } catch (e) {
    console.error(e);
  }
});
