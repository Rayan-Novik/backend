import { Router } from 'express';
import prisma from '../../../config/prisma.js';
import { getTenantId } from '../shared/tenantHelper.js';

export const tabelasRouter = Router();

const parseDecimal = (val) => {
  if (val === undefined || val === null || val === '') return null;
  const str = String(val).replace(',', '.').trim();
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
};

const sanitizeTabelaData = (modelName, raw) => {
  if (!raw || typeof raw !== 'object') return {};
  const data = {};

  // 1. Tratamento do Código
  if (raw.codigo !== undefined && raw.codigo !== null) {
    if (modelName === 'fiscal_origens') {
      data.codigo = parseInt(raw.codigo, 10);
      if (isNaN(data.codigo)) data.codigo = 0;
    } else {
      data.codigo = String(raw.codigo).trim();
    }
  }

  // 2. Descrição
  if (raw.descricao !== undefined && raw.descricao !== null) {
    data.descricao = String(raw.descricao).trim();
  }

  // 3. Validades opcionais
  if (raw.validade_inicio) {
    const d = new Date(raw.validade_inicio);
    if (!isNaN(d.getTime())) data.validade_inicio = d;
  }
  if (raw.validade_fim) {
    const d = new Date(raw.validade_fim);
    if (!isNaN(d.getTime())) data.validade_fim = d;
    else data.validade_fim = null;
  }

  // 4. Campos específicos estritamente aceitos por cada modelo do Prisma
  if (modelName === 'fiscal_cfops') {
    data.tipo_operacao = raw.tipo_operacao ? String(raw.tipo_operacao).toUpperCase().trim() : 'SAIDA';
    data.aplicacao = raw.aplicacao ? String(raw.aplicacao).toUpperCase().trim() : 'INTERNA';
  } else if (modelName === 'fiscal_ncms') {
    data.aliquota_nacional = parseDecimal(raw.aliquota_nacional);
    data.aliquota_importada = parseDecimal(raw.aliquota_importada);
    data.aliquota_estadual = parseDecimal(raw.aliquota_estadual);
    data.aliquota_municipal = parseDecimal(raw.aliquota_municipal);
  } else if (modelName === 'fiscal_class_trib_ibs_cbs') {
    if (raw.cst_id !== undefined) data.cst_id = String(raw.cst_id);
    if (raw.descricao_reduzida !== undefined) data.descricao_reduzida = String(raw.descricao_reduzida).trim();
    data.reducao_percentual_ibs = parseDecimal(raw.reducao_percentual_ibs);
    data.reducao_percentual_cbs = parseDecimal(raw.reducao_percentual_cbs);
    data.pct_bio_combustivel = parseDecimal(raw.pct_bio_combustivel);
    data.tributacao_regular = Boolean(raw.tributacao_regular);
    data.credito_presumido = Boolean(raw.credito_presumido);
    data.estorno_credito = Boolean(raw.estorno_credito);
  } else if (modelName === 'fiscal_csts_ibs_cbs') {
    data.exige_tributacao = Boolean(raw.exige_tributacao);
    data.reducao_bc = Boolean(raw.reducao_bc);
    data.reducao_aliquota = Boolean(raw.reducao_aliquota);
    data.transferencia_credito = Boolean(raw.transferencia_credito);
    data.diferimento = Boolean(raw.diferimento);
    data.monofasica = Boolean(raw.monofasica);
    data.credito_presumido_ibs_zfm = Boolean(raw.credito_presumido_ibs_zfm);
    data.ajuste_credito = Boolean(raw.ajuste_credito);
  }

  return data;
};

const makeCrud = (modelName) => {
  const router = Router();

  // GET ALL / BUSCA
  router.get('/', async (req, res) => {
    try {
      const tenant_id = getTenantId(req);
      const { q } = req.query;

      const where = { tenant_id: String(tenant_id) };
      if (q) {
        where.OR = [
          { codigo: { contains: String(q) } },
          { descricao: { contains: String(q) } }
        ];
      }

      const records = await prisma[modelName].findMany({
        where,
        orderBy: { codigo: 'asc' }
      });
      res.json(records);
    } catch (e) {
      console.error(`Erro ao listar ${modelName}:`, e);
      res.status(500).json({ error: e.message, message: e.message });
    }
  });

  // GET ONE BY ID
  router.get('/:id', async (req, res) => {
    try {
      const tenant_id = getTenantId(req);
      const record = await prisma[modelName].findFirst({
        where: { id: req.params.id, tenant_id: String(tenant_id) }
      });
      if (!record) {
        return res.status(404).json({ error: 'Registro não encontrado.', message: 'Registro não encontrado.' });
      }
      res.json(record);
    } catch (e) {
      console.error(`Erro ao buscar ${modelName}:`, e);
      res.status(500).json({ error: e.message, message: e.message });
    }
  });

  // CREATE / UPSERT
  router.post('/', async (req, res) => {
    try {
      const tenant_id = getTenantId(req);
      const data = sanitizeTabelaData(modelName, req.body);

      if (data.codigo === undefined || data.codigo === null || data.codigo === '') {
        return res.status(400).json({ success: false, error: 'Código é obrigatório.', message: 'Código é obrigatório.' });
      }
      if (!data.descricao) {
        return res.status(400).json({ success: false, error: 'Descrição é obrigatória.', message: 'Descrição é obrigatória.' });
      }

      // Verifica se já existe pelo código único para este tenant
      const existing = await prisma[modelName].findFirst({
        where: {
          tenant_id: String(tenant_id),
          codigo: data.codigo
        }
      });

      let record;
      if (existing) {
        // Atualiza o existente se já cadastrado (upsert transparente)
        record = await prisma[modelName].update({
          where: { id: existing.id },
          data
        });
        return res.status(200).json(record);
      } else {
        // Cria novo
        record = await prisma[modelName].create({
          data: {
            tenant_id: String(tenant_id),
            ...data
          }
        });
        return res.status(201).json(record);
      }
    } catch (e) {
      console.error(`Erro ao salvar ${modelName}:`, e);
      res.status(500).json({ success: false, error: e.message, message: e.message });
    }
  });

  // UPDATE BY ID
  router.put('/:id', async (req, res) => {
    try {
      const tenant_id = getTenantId(req);
      const data = sanitizeTabelaData(modelName, req.body);

      const record = await prisma[modelName].update({
        where: { id: req.params.id },
        data
      });
      res.json(record);
    } catch (e) {
      console.error(`Erro ao atualizar ${modelName}:`, e);
      res.status(500).json({ success: false, error: e.message, message: e.message });
    }
  });

  // DELETE BY ID
  router.delete('/:id', async (req, res) => {
    try {
      await prisma[modelName].delete({ where: { id: req.params.id } });
      res.json({ success: true, message: 'Registro excluído com sucesso.' });
    } catch (e) {
      console.error(`Erro ao excluir ${modelName}:`, e);
      res.status(500).json({ success: false, error: e.message, message: e.message });
    }
  });

  return router;
};

tabelasRouter.use('/cfop', makeCrud('fiscal_cfops'));
tabelasRouter.use('/ncm', makeCrud('fiscal_ncms'));
tabelasRouter.use('/cest', makeCrud('fiscal_cests'));
tabelasRouter.use('/origem', makeCrud('fiscal_origens'));
tabelasRouter.use('/cst', makeCrud('fiscal_csts'));
tabelasRouter.use('/csosn', makeCrud('fiscal_csosns'));
tabelasRouter.use('/cst-ibs', makeCrud('fiscal_csts_ibs_cbs'));
tabelasRouter.use('/class-trib-ibs', makeCrud('fiscal_class_trib_ibs_cbs'));

tabelasRouter.get('/class-trib-ibs/por-cst/:cst_id', async (req, res) => {
  try {
    const tenant_id = getTenantId(req);
    const { cst_id } = req.params;
    const records = await prisma.fiscal_class_trib_ibs_cbs.findMany({
      where: { tenant_id: String(tenant_id), cst_id: String(cst_id) }
    });
    res.json(records);
  } catch (e) {
    res.status(500).json({ error: e.message, message: e.message });
  }
});

tabelasRouter.get('/cst-ibs-com-classificacoes', async (req, res) => {
  try {
    const tenant_id = getTenantId(req);
    const records = await prisma.fiscal_csts_ibs_cbs.findMany({
      where: { tenant_id: String(tenant_id) },
      include: { classificacoes: true }
    });
    res.json(records);
  } catch (e) {
    res.status(500).json({ error: e.message, message: e.message });
  }
});
