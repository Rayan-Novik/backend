import { Router } from 'express';
import prisma from '../../../config/prisma.js';
import { getTenantId } from '../shared/tenantHelper.js';

export const formasPagamentoRouter = Router();

formasPagamentoRouter.get('/', async (req, res) => {
  try {
    const tenant_id = getTenantId(req);
    const formas = await prisma.fiscal_formas_pagamento.findMany({
      where: { tenant_id: String(tenant_id) },
      orderBy: { descricao: 'asc' }
    });
    return res.json(formas);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

formasPagamentoRouter.post('/', async (req, res) => {
  try {
    const tenant_id = getTenantId(req);
    const { id, descricao, codigo_sefaz } = req.body;

    let forma;
    if (id) {
      forma = await prisma.fiscal_formas_pagamento.update({
        where: { id },
        data: { descricao, codigo_sefaz }
      });
    } else {
      forma = await prisma.fiscal_formas_pagamento.create({
        data: { tenant_id, descricao, codigo_sefaz }
      });
    }
    return res.status(201).json(forma);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

formasPagamentoRouter.put('/:id', async (req, res) => {
  try {
    const { tenant_id, id, created_at, updated_at, ...updateData } = req.body;
    const result = await prisma.fiscal_formas_pagamento.update({
      where: { id: req.params.id },
      data: updateData
    });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

formasPagamentoRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.fiscal_formas_pagamento.delete({
      where: { id: req.params.id }
    });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});
