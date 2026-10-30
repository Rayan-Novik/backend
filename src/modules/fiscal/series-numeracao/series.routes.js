import { Router } from 'express';
import prisma from '../../../config/prisma.js';
import { getTenantId } from '../shared/tenantHelper.js';

export const seriesRouter = Router();

seriesRouter.post('/', async (req, res) => {
  try {
    const tenant_id = getTenantId(req);
    const { estabelecimento_id, modelo, serie, ultimo_numero } = req.body;
    if (!estabelecimento_id) return res.status(400).json({ error: 'estabelecimento_id required' });

    const result = await prisma.$transaction(async (tx) => {
      const novaSerie = await tx.fiscal_series.create({
        data: { tenant_id, estabelecimento_id, modelo: String(modelo || '55'), serie: Number(serie || 1) }
      });

      const numeracao = await tx.fiscal_numeracoes.create({
        data: {
          tenant_id,
          serie_id: novaSerie.id,
          ultimo_numero: Number(ultimo_numero || 0)
        }
      });
      return { ...novaSerie, numeracoes: numeracao };
    });

    return res.status(201).json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

seriesRouter.get('/', async (req, res) => {
  try {
    const { estabelecimento_id } = req.query;
    const tenant_id = getTenantId(req);

    const series = await prisma.fiscal_series.findMany({
      where: {
        tenant_id: String(tenant_id),
        ...(estabelecimento_id ? { estabelecimento_id: String(estabelecimento_id) } : {})
      },
      include: { numeracoes: true }
    });
    return res.json(series);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

seriesRouter.post('/:serie_id/proximo-numero', async (req, res) => {
  try {
    const { serie_id } = req.params;

    const updated = await prisma.fiscal_numeracoes.update({
      where: { serie_id },
      data: { ultimo_numero: { increment: 1 } }
    });

    return res.json({ proximo_numero: updated.ultimo_numero });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

seriesRouter.put('/:id', async (req, res) => {
  try {
    const { tenant_id, ultimo_numero, numeracoes, ...updateData } = req.body;
    if (updateData.serie !== undefined) updateData.serie = Number(updateData.serie);
    const result = await prisma.fiscal_series.update({
      where: { id: req.params.id },
      data: updateData
    });
    if (ultimo_numero !== undefined) {
      await prisma.fiscal_numeracoes.updateMany({
        where: { serie_id: req.params.id },
        data: { ultimo_numero: Number(ultimo_numero) }
      });
    }
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

seriesRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.fiscal_numeracoes.deleteMany({ where: { serie_id: req.params.id } });
    await prisma.fiscal_series.delete({ where: { id: req.params.id } });
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});
