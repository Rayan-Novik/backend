import { Router } from 'express';
import prisma from '../../../config/prisma.js';
import { getTenantId } from '../shared/tenantHelper.js';

export const webhooksRouter = Router();

webhooksRouter.post('/', async (req, res) => {
  try {
    const tenant_id = getTenantId(req);
    const { url, eventos, estabelecimento_id, secret, ativo } = req.body;

    if (!url || !eventos) {
      return res.status(400).json({ error: 'url e eventos são obrigatórios' });
    }

    const webhook = await prisma.fiscal_webhooks.create({
      data: {
        tenant_id,
        estabelecimento_id: estabelecimento_id || null,
        url,
        eventos: Array.isArray(eventos) ? eventos.join(',') : eventos,
        secret: secret || null,
        ativo: ativo !== undefined ? ativo : true
      }
    });

    return res.status(201).json(webhook);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

webhooksRouter.get('/', async (req, res) => {
  try {
    const tenant_id = getTenantId(req);
    const webhooks = await prisma.fiscal_webhooks.findMany({
      where: { tenant_id: String(tenant_id) }
    });
    return res.json(webhooks);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

webhooksRouter.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { tenant_id, id: _id, created_at, updated_at, ...data } = req.body;

    if (data.eventos && Array.isArray(data.eventos)) {
      data.eventos = data.eventos.join(',');
    }

    const webhook = await prisma.fiscal_webhooks.update({
      where: { id },
      data
    });
    return res.json(webhook);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

webhooksRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.fiscal_webhooks.delete({
      where: { id: req.params.id }
    });
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});
