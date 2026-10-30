import { Router } from 'express';
import crypto from 'crypto';
import prisma from '../../../config/prisma.js';
import { getTenantId } from '../shared/tenantHelper.js';

export const tokensRouter = Router();

tokensRouter.get('/', async (req, res) => {
  try {
    const tenant_id = getTenantId(req);
    const tokens = await prisma.fiscal_api_tokens.findMany({
      where: { tenant_id: String(tenant_id) },
      orderBy: { created_at: 'desc' }
    });
    return res.json(tokens);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

tokensRouter.post('/', async (req, res) => {
  try {
    const { nome, ambiente } = req.body;
    const tenant_id = getTenantId(req);
    if (!nome || !ambiente) return res.status(400).json({ error: 'Dados incompletos' });

    const prefix = Number(ambiente) === 1 ? 'sk_live_' : 'sk_test_';
    const randomStr = crypto.randomBytes(24).toString('hex');
    const tokenStr = prefix + randomStr;

    const token = await prisma.fiscal_api_tokens.create({
      data: {
        tenant_id,
        nome,
        ambiente: Number(ambiente),
        token: tokenStr,
        ativo: true
      }
    });

    return res.status(201).json(token);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

tokensRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.fiscal_api_tokens.delete({
      where: { id: req.params.id }
    });
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});
