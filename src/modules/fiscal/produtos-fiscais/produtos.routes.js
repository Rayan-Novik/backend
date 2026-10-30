import { Router } from 'express';
import prisma from '../../../config/prisma.js';
import { getTenantId } from '../shared/tenantHelper.js';

export const produtosRouter = Router();

produtosRouter.post('/', async (req, res) => {
  try {
    const tenant_id = getTenantId(req);
    const { tenant_id: _t, ...data } = req.body;

    const result = await prisma.fiscal_produtos.create({
      data: { ...data, tenant_id }
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

produtosRouter.get('/', async (req, res) => {
  try {
    const tenant_id = getTenantId(req);

    const produtos = await prisma.fiscal_produtos.findMany({
      where: { tenant_id: String(tenant_id) }
    });
    res.json(produtos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

produtosRouter.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { tenant_id, ...data } = req.body;

    const result = await prisma.fiscal_produtos.update({
      where: { id },
      data
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

produtosRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.fiscal_produtos.delete({
      where: { id }
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
