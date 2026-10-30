import { Router } from 'express';
import prisma from '../../../config/prisma.js';
import { getTenantId } from '../shared/tenantHelper.js';

export const destinatariosRouter = Router();

destinatariosRouter.get('/', async (req, res) => {
  try {
    const tenant_id = getTenantId(req);
    const destinatarios = await prisma.fiscal_destinatarios.findMany({
      where: { tenant_id: String(tenant_id) },
      orderBy: { razao_social: 'asc' }
    });
    return res.json(destinatarios);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

destinatariosRouter.post('/', async (req, res) => {
  try {
    const tenant_id = getTenantId(req);
    const { tenant_id: _t, ...data } = req.body;
    const destinatario = await prisma.fiscal_destinatarios.create({
      data: { ...data, tenant_id }
    });
    return res.status(201).json(destinatario);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

destinatariosRouter.put('/:id', async (req, res) => {
  try {
    const { tenant_id, id, created_at, updated_at, ...updateData } = req.body;
    const destinatario = await prisma.fiscal_destinatarios.update({
      where: { id: req.params.id },
      data: updateData
    });
    return res.json(destinatario);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

destinatariosRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.fiscal_destinatarios.delete({ where: { id: req.params.id } });
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});
