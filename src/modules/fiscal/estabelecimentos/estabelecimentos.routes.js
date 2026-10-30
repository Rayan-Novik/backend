import { Router } from 'express';
import prisma from '../../../config/prisma.js';
import { getTenantId } from '../shared/tenantHelper.js';

export const estabelecimentosRouter = Router();

estabelecimentosRouter.post('/', async (req, res) => {
  try {
    const tenant_id = getTenantId(req);
    const {
      empresa_id, cnpj, nome, ie,
      logradouro, numero, bairro, municipio, codigo_municipio_ibge, uf, cep, csc, id_token_csc
    } = req.body;
    if (!empresa_id) return res.status(400).json({ error: 'empresa_id is required' });

    const estabelecimento = await prisma.fiscal_estabelecimentos.create({
      data: {
        tenant_id, empresa_id, cnpj, nome, ie,
        logradouro, numero, bairro, municipio, codigo_municipio_ibge, uf, cep, csc, id_token_csc
      }
    });
    return res.status(201).json(estabelecimento);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

estabelecimentosRouter.get('/', async (req, res) => {
  try {
    const { empresa_id } = req.query;
    const tenant_id = getTenantId(req);

    const estabelecimentos = await prisma.fiscal_estabelecimentos.findMany({
      where: {
        tenant_id: String(tenant_id),
        ...(empresa_id ? { empresa_id: String(empresa_id) } : {})
      }
    });
    return res.json(estabelecimentos);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});
