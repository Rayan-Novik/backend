import { Router } from 'express';
import prisma from '../../../config/prisma.js';
import { getTenantId } from '../shared/tenantHelper.js';

export const cenariosRouter = Router();

cenariosRouter.post('/', async (req, res) => {
  try {
    const tenant_id = getTenantId(req);
    const { operacao, documento, finalidade, modelo, cfop_padrao, movimenta_estoque, gera_financeiro } = req.body;

    const cenario = await prisma.fiscal_cenarios_fiscais.create({
      data: {
        tenant_id,
        operacao,
        documento: documento || (String(modelo) === '65' ? 'NFC-e' : 'NF-e'),
        finalidade: Number(finalidade || 1),
        modelo: String(modelo || '55'),
        cfop_padrao,
        movimenta_estoque: Boolean(movimenta_estoque),
        gera_financeiro: Boolean(gera_financeiro)
      }
    });
    return res.status(201).json(cenario);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

cenariosRouter.get('/', async (req, res) => {
  try {
    const tenant_id = getTenantId(req);

    const cenarios = await prisma.fiscal_cenarios_fiscais.findMany({
      where: { tenant_id: String(tenant_id) }
    });
    return res.json(cenarios);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

cenariosRouter.put('/:id', async (req, res) => {
  try {
    const { tenant_id, id, created_at, updated_at, ...updateData } = req.body;
    if (updateData.finalidade !== undefined) updateData.finalidade = Number(updateData.finalidade);
    const result = await prisma.fiscal_cenarios_fiscais.update({
      where: { id: req.params.id },
      data: updateData
    });
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

cenariosRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.fiscal_cenarios_fiscais.delete({ where: { id: req.params.id } });
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});
