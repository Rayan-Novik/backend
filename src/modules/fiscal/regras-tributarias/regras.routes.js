import { Router } from 'express';
import prisma from '../../../config/prisma.js';
import { calcularImpostosItem } from './calcular.js';
import { getTenantId } from '../shared/tenantHelper.js';

export const regrasRouter = Router();

const makeRegrasCrud = (modelName) => {
  const router = Router();

  router.get('/', async (req, res) => {
    try {
      const tenant_id = getTenantId(req);
      const records = await prisma[modelName].findMany({
        where: { tenant_id: String(tenant_id) },
        orderBy: { created_at: 'desc' }
      });
      res.json(records);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.post('/', async (req, res) => {
    try {
      const tenant_id = getTenantId(req);
      const { tenant_id: _t, validade_inicio, validade_fim, validado_por, id, ...data } = req.body;

      const cleanData = {};
      for (const [key, value] of Object.entries(data)) {
        if (value === '') {
          cleanData[key] = null;
        } else if (
          key.includes('aliquota') ||
          key.includes('mva') ||
          key === 'base_calculo' ||
          key === 'finalidade' ||
          key === 'reducao_percentual_ibs' ||
          key === 'reducao_percentual_cbs'
        ) {
          cleanData[key] = Number(value);
        } else if (value === 'true' || value === 'false') {
          cleanData[key] = value === 'true';
        } else {
          cleanData[key] = value;
        }
      }

      if (modelName === 'fiscal_regras_icms') {
        if (cleanData.aliquota_icms !== undefined && cleanData.aliquota_icms !== null) cleanData.aliquota = cleanData.aliquota_icms;
        if (cleanData.aliquota_icms_st !== undefined && cleanData.aliquota_icms_st !== null) cleanData.aliquota_st = cleanData.aliquota_icms_st;
        if (cleanData.base_calculo === undefined || cleanData.base_calculo === null) cleanData.base_calculo = 100.0;

        if (cleanData.uf_origem === null || cleanData.uf_origem === undefined) cleanData.uf_origem = '';
        if (cleanData.uf_destino === null || cleanData.uf_destino === undefined) cleanData.uf_destino = '';
        if (cleanData.cst_csosn === null || cleanData.cst_csosn === undefined) cleanData.cst_csosn = '00';
        if (cleanData.aliquota === null || cleanData.aliquota === undefined) cleanData.aliquota = 0;
        if (cleanData.aliquota_st === null) cleanData.aliquota_st = 0;
        if (cleanData.mva_st === null) cleanData.mva_st = 0;

        delete cleanData.aliquota_icms;
        delete cleanData.aliquota_icms_st;
      }

      if (cleanData.aliquota === null) cleanData.aliquota = 0;
      if (cleanData.aliquota_pis === null) cleanData.aliquota_pis = 0;
      if (cleanData.aliquota_cofins === null) cleanData.aliquota_cofins = 0;
      if (cleanData.aliquota_ibs === null) cleanData.aliquota_ibs = 0;
      if (cleanData.aliquota_cbs === null) cleanData.aliquota_cbs = 0;
      if (cleanData.aliquota_ipi === null) cleanData.aliquota_ipi = 0;

      const dataIni = validade_inicio ? new Date(validade_inicio) : new Date();
      const dataFim = validade_fim ? new Date(validade_fim) : null;

      let record;
      if (id) {
        record = await prisma[modelName].update({
          where: { id },
          data: {
            ...cleanData,
            validado_por: validado_por || null,
            validado_em: validado_por ? new Date() : null,
            validade_inicio: dataIni,
            validade_fim: dataFim
          }
        });
      } else {
        record = await prisma[modelName].create({
          data: {
            tenant_id,
            ...cleanData,
            validado_por: validado_por || null,
            validado_em: validado_por ? new Date() : null,
            validade_inicio: dataIni,
            validade_fim: dataFim
          }
        });
      }
      res.status(id ? 200 : 201).json(record);
    } catch (e) {
      console.error('ERRO NO POST REGRAS:', e);
      res.status(500).json({ error: e.message });
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { tenant_id, validade_inicio, validade_fim, validado_por, ...data } = req.body;

      const payload = { ...data };
      if (validade_inicio) payload.validade_inicio = new Date(validade_inicio);
      if (validade_fim) payload.validade_fim = new Date(validade_fim);

      const record = await prisma[modelName].update({
        where: { id },
        data: payload
      });
      res.json(record);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      await prisma[modelName].delete({ where: { id: req.params.id } });
      res.status(204).send();
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};

regrasRouter.use('/icms', makeRegrasCrud('fiscal_regras_icms'));
regrasRouter.use('/ipi', makeRegrasCrud('fiscal_regras_ipi'));
regrasRouter.use('/pis-cofins', makeRegrasCrud('fiscal_regras_pis_cofins'));
regrasRouter.use('/ibs-cbs', makeRegrasCrud('fiscal_regras_ibs_cbs'));

regrasRouter.get('/sugerir', async (req, res) => {
  try {
    const { ncm } = req.query;
    const tenant_id = getTenantId(req);

    const sugestao = {};

    if (ncm) {
      const ncmString = String(ncm).replace(/\D/g, '');

      const regraIcms = await prisma.fiscal_regras_icms.findFirst({
        where: { tenant_id: String(tenant_id), ncm: ncmString },
        orderBy: { created_at: 'desc' }
      });
      if (regraIcms) {
        sugestao.cst_csosn_padrao = regraIcms.cst_csosn;
        sugestao.aliquota_icms = regraIcms.aliquota;
      } else {
        const ncmDb = await prisma.fiscal_ncms.findFirst({
          where: { tenant_id: String(tenant_id), codigo: ncmString }
        });
        if (ncmDb && ncmDb.aliquota_estadual) {
          sugestao.aliquota_icms = ncmDb.aliquota_estadual;
        }
      }

      const regraIpi = await prisma.fiscal_regras_ipi.findFirst({
        where: { tenant_id: String(tenant_id), ncm: ncmString },
        orderBy: { created_at: 'desc' }
      });
      if (regraIpi) sugestao.aliquota_ipi = regraIpi.aliquota;

      const regraPisCofins = await prisma.fiscal_regras_pis_cofins.findFirst({
        where: { tenant_id: String(tenant_id), ncm: ncmString },
        orderBy: { created_at: 'desc' }
      });
      if (regraPisCofins) {
        sugestao.aliquota_pis = regraPisCofins.aliquota_pis;
        sugestao.aliquota_cofins = regraPisCofins.aliquota_cofins;
      }

      const regraIbsCbs = await prisma.fiscal_regras_ibs_cbs.findFirst({
        where: { tenant_id: String(tenant_id), ncm: ncmString },
        orderBy: { created_at: 'desc' }
      });
      if (regraIbsCbs) {
        sugestao.cClassTrib = regraIbsCbs.cClassTrib;
        sugestao.aliquota_ibs = regraIbsCbs.aliquota_ibs;
        sugestao.aliquota_cbs = regraIbsCbs.aliquota_cbs;
      }
    }

    res.json(sugestao);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

regrasRouter.post('/calcular-item', async (req, res) => {
  try {
    const tenant_id = getTenantId(req);
    const result = await calcularImpostosItem({ ...req.body, tenant_id });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
