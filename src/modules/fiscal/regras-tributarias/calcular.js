import prisma from '../../../config/prisma.js';

function calcularEspecificidade(regra, modelName) {
  let score = 0;

  if (regra.cClassTrib) score += 10000;
  if (regra.regime) score += 1000;
  if (regra.ncm) score += 500;
  if (regra.cest) score += 400;
  if (regra.cfop) score += 300;

  if (modelName === 'fiscal_regras_icms') {
    if (regra.uf_origem && regra.uf_destino) score += 200;
    if (regra.tipo_cliente) score += 100;
    if (regra.finalidade) score += 50;
  }

  return score;
}

async function buscarRegraMaisEspecifica(modelName, params) {
  const { tenant_id, uf_origem, uf_destino, ncm, cest, cfop, cClassTrib, tipo_cliente, finalidade, dataAtual, regime } = params;

  const baseWhere = {
    tenant_id: String(tenant_id),
    validade_inicio: { lte: dataAtual },
    OR: [
      { validade_fim: null },
      { validade_fim: { gte: dataAtual } }
    ]
  };

  const andClauses = [];

  andClauses.push({ OR: [{ ncm: ncm || null }, { ncm: null }, { ncm: '' }] });
  const cfDot = cfop ? (cfop.includes('.') ? cfop : cfop.slice(0, 1) + '.' + cfop.slice(1)) : null;
  const cfNoDot = cfop ? cfop.replace(/\./g, '') : null;
  andClauses.push({ OR: [{ cfop: cfop || null }, { cfop: cfDot }, { cfop: cfNoDot }, { cfop: null }, { cfop: '' }] });
  if (cest) andClauses.push({ OR: [{ cest: cest || null }, { cest: null }, { cest: '' }] });
  else andClauses.push({ OR: [{ cest: null }, { cest: '' }] });

  andClauses.push({ OR: [{ regime: regime || null }, { regime: null }] });

  if (modelName === 'fiscal_regras_ibs_cbs') {
    if (cClassTrib) andClauses.push({ OR: [{ cClassTrib: cClassTrib || null }, { cClassTrib: null }, { cClassTrib: '' }] });
    else andClauses.push({ OR: [{ cClassTrib: null }, { cClassTrib: '' }] });
  }

  if (modelName === 'fiscal_regras_icms') {
    andClauses.push({ OR: [{ uf_origem: uf_origem || '' }, { uf_origem: '' }] });
    andClauses.push({ OR: [{ uf_destino: uf_destino || '' }, { uf_destino: '' }] });
    andClauses.push({ OR: [{ tipo_cliente: tipo_cliente || null }, { tipo_cliente: null }, { tipo_cliente: '' }] });
    andClauses.push({ OR: [{ finalidade: finalidade || null }, { finalidade: null }, { finalidade: 0 }] });
  }

  const where = { ...baseWhere, AND: andClauses };

  const regras = await prisma[modelName].findMany({ where });
  global[`__diag_count_${modelName}`] = regras.length;

  if (regras.length === 0) {
    let p = `Regime=${regime}, NCM=${ncm}, CEST=${cest || 'N/A'}, CFOP=${cfop}`;
    if (cClassTrib) p += `, cClassTrib=${cClassTrib}`;
    if (modelName === 'fiscal_regras_icms') p += `, UF=${uf_origem}->${uf_destino}`;
    return { regra: null, parametrosPesquisados: p };
  }

  regras.sort((a, b) => {
    const scoreA = calcularEspecificidade(a, modelName);
    const scoreB = calcularEspecificidade(b, modelName);
    if (scoreA !== scoreB) return scoreB - scoreA;
    return b.validade_inicio.getTime() - a.validade_inicio.getTime();
  });

  const regraMaisEspecifica = regras[0];

  if (regras.length > 1) {
    const score0 = calcularEspecificidade(regras[0], modelName);
    const score1 = calcularEspecificidade(regras[1], modelName);
    if (score0 === score1 && regras[0].validade_inicio.getTime() === regras[1].validade_inicio.getTime()) {
      return { regra: null, conflito: true, parametrosPesquisados: `Conflito entre duas ou mais regras com a mesma especificidade (Score ${score0})` };
    }
  }

  const isGenerica = calcularEspecificidade(regraMaisEspecifica, modelName) === 0;

  return {
    regra: regraMaisEspecifica,
    generica: isGenerica
  };
}

const round2 = (num) => Number(Number(num || 0).toFixed(2));

export async function calcularImpostosItem(params) {
  global[`__diag_count_fiscal_regras_icms`] = 0;
  global[`__diag_count_fiscal_regras_ibs_cbs`] = 0;

  const {
    tenant_id,
    uf_origem,
    uf_destino,
    tipo_cliente,
    finalidade,
    ncm,
    cfop,
    valor_produto,
    valor_item,
    quantidade = 1,
    desconto = 0,
    frete = 0,
    seguro = 0,
    outros = 0
  } = params;

  const vUnit = valor_produto !== undefined ? Number(valor_produto) : Number(valor_item || 100);
  const valorTotalBruto = round2((vUnit * Number(quantidade)) - Number(desconto) + Number(frete) + Number(seguro) + Number(outros));

  let produto = null;
  if (params.produto_id) {
    produto = await prisma.fiscal_produtos.findUnique({ where: { id: String(params.produto_id) } });
    if (!produto) {
      produto = await prisma.fiscal_produtos.findFirst({
        where: { tenant_id: String(tenant_id), codigo_interno: String(params.produto_id) }
      });
    }
    if (!produto) throw new Error('Produto não encontrado');
  } else {
    produto = {
      id: 'SIMULACAO',
      codigo_interno: 'SIM',
      descricao: 'Simulação Tributária',
      ncm: ncm || '00000000',
      cest: params.cest || null,
      ean_gtin: 'SEM GTIN',
      origem: 0,
      cClassTrib: params.cClassTrib || null
    };
  }

  let empresa = null;
  if (params.empresa_id) {
    empresa = await prisma.fiscal_empresas.findUnique({ where: { id: params.empresa_id } });
  } else {
    empresa = await prisma.fiscal_empresas.findFirst({ where: { tenant_id: String(tenant_id) } });
  }
  const dataAtual = new Date();
  const regime = empresa?.crt || 'SIMPLES_NACIONAL';

  const pendencias = [];
  let isNcmValido = true;

  if (!ncm && !produto.ncm) {
    pendencias.push('NCM não informado');
  }

  const ncmEfetivo = ncm || produto.ncm || '00000000';

  if (!isNcmValido) {
    return {
      status: 'PENDENTE_TRIBUTACAO',
      pendencias,
      produto: {
        id: produto.id,
        codigo: produto.codigo_interno,
        descricao: produto.descricao,
        ncm: produto.ncm,
        cest: produto.cest,
        ean_gtin: produto.ean_gtin,
        origem: produto.origem
      },
      cfop: params.cfop,
      tributacao: {
        icms: { status: 'PENDENTE', motivo: 'NCM_INVALIDO' },
        icms_st: { status: 'PENDENTE', motivo: 'NCM_INVALIDO' },
        ipi: { status: 'PENDENTE', motivo: 'NCM_INVALIDO' },
        pis: { status: 'PENDENTE', motivo: 'NCM_INVALIDO' },
        cofins: { status: 'PENDENTE', motivo: 'NCM_INVALIDO' },
        ibs: { status: 'PENDENTE', motivo: 'NCM_INVALIDO' },
        cbs: { status: 'PENDENTE', motivo: 'NCM_INVALIDO' }
      },
      totais: { bruto: valorTotalBruto, impostos_calculados: 0, tributacao_completa: false, total_definitivo: null }
    };
  }

  const resIcms = await buscarRegraMaisEspecifica('fiscal_regras_icms', {
    tenant_id, uf_origem, uf_destino, ncm: ncmEfetivo, cest: produto.cest,
    ean_gtin: produto.ean_gtin, cfop, tipo_cliente, finalidade, dataAtual, regime
  });
  const resIpi = await buscarRegraMaisEspecifica('fiscal_regras_ipi', {
    tenant_id, uf_origem, uf_destino, ncm: ncmEfetivo, cest: produto.cest,
    ean_gtin: produto.ean_gtin, cfop, dataAtual, regime
  });
  const resPisCofins = await buscarRegraMaisEspecifica('fiscal_regras_pis_cofins', {
    tenant_id, uf_origem, uf_destino, ncm: ncmEfetivo, cest: produto.cest,
    ean_gtin: produto.ean_gtin, cfop, dataAtual, regime
  });
  const resIbsCbs = await buscarRegraMaisEspecifica('fiscal_regras_ibs_cbs', {
    tenant_id, uf_origem, uf_destino, ncm: ncmEfetivo, cest: produto.cest,
    ean_gtin: produto.ean_gtin, cfop, cClassTrib: produto.cClassTrib, dataAtual, regime
  });

  // Fallback Genérico Automático (usando dados do produto fiscal quando disponíveis)
  if (!resIcms.regra) {
    resIcms.regra = {
      nome_regra: 'Fallback Automático ICMS',
      cst_csosn: produto.cst_csosn_padrao || (regime === 'SIMPLES_NACIONAL' ? '102' : '00'),
      base_calculo: 100,
      aliquota: Number(produto.aliquota_icms || 0),
      mva_st: null
    };
    resIcms.generica = true;
  }
  if (!resIpi.regra) {
    resIpi.regra = {
      nome_regra: 'Fallback Automático IPI',
      cst: '99',
      aliquota: Number(produto.aliquota_ipi || 0)
    };
  }
  if (!resPisCofins.regra) {
    resPisCofins.regra = {
      nome_regra: 'Fallback Automático PIS/COFINS',
      cst: '49',
      aliquota_pis: Number(produto.aliquota_pis || 0),
      aliquota_cofins: Number(produto.aliquota_cofins || 0)
    };
  }
  if (!resIbsCbs.regra) {
    resIbsCbs.regra = {
      nome_regra: 'Fallback Automático IBS/CBS',
      cst: produto.cClassTrib?.startsWith('000') ? '000' : '410',
      cClassTrib: produto.cClassTrib || '410001',
      aliquota_ibs: Number(produto.aliquota_ibs || 0),
      aliquota_cbs: Number(produto.aliquota_cbs || 0)
    };
  }

  const { regra: regraIcms, parametrosPesquisados: pIcms, conflito: cIcms } = resIcms;
  const { regra: regraIpi, parametrosPesquisados: pIpi, conflito: cIpi } = resIpi;
  const { regra: regraPisCofins, parametrosPesquisados: pPis, conflito: cPis } = resPisCofins;
  const { regra: regraIbsCbs, parametrosPesquisados: pIbs, conflito: cIbs } = resIbsCbs;

  let icms = { status: 'PENDENTE', motivo: cIcms ? pIcms : 'nenhuma regra compatível encontrada', parametros_pesquisados: pIcms };
  let icms_st = { status: 'PENDENTE', motivo: 'REGRA_ICMS_ST_NAO_ENCONTRADA' };
  let ipi = { status: 'PENDENTE', motivo: cIpi ? pIpi : 'nenhuma regra compatível encontrada', parametros_pesquisados: pIpi };
  let pis = { status: 'PENDENTE', motivo: cPis ? pPis : 'nenhuma regra compatível encontrada', parametros_pesquisados: pPis };
  let cofins = { status: 'PENDENTE', motivo: cPis ? pPis : 'nenhuma regra compatível encontrada', parametros_pesquisados: pPis };
  let ibs = { status: 'PENDENTE', motivo: cIbs ? pIbs : 'nenhuma regra compatível encontrada', parametros_pesquisados: pIbs };
  let cbs = { status: 'PENDENTE', motivo: cIbs ? pIbs : 'nenhuma regra compatível encontrada', parametros_pesquisados: pIbs };

  let impostosCalculados = 0;

  if (regraIcms) {
    let cst = regraIcms.cst_csosn;
    if (cst === '00' && regime === 'SIMPLES_NACIONAL') {
      cst = '102';
    }
    icms.status = 'CALCULADO';
    icms.motivo = undefined;
    icms.parametros_pesquisados = undefined;
    icms.cst_csosn = cst;
    icms.regra_aplicada = regraIcms.nome_regra;
    icms.origem_regra = resIcms.generica ? 'Regra Genérica' : 'Regra Específica';

    const redutorBase = Number(regraIcms.base_calculo) / 100.0;
    icms.base = round2(valorTotalBruto * redutorBase);
    icms.aliquota = Number(regraIcms.aliquota);
    icms.valor = round2(icms.base * (icms.aliquota / 100.0));
    impostosCalculados += icms.valor;

    if (regraIcms.mva_st && regraIcms.aliquota_st && Number(regraIcms.mva_st) > 0) {
      icms_st.status = 'CALCULADO';
      icms_st.motivo = undefined;
      icms_st.mva = Number(regraIcms.mva_st);
      icms_st.aliquota = Number(regraIcms.aliquota_st);
      icms_st.base = round2(icms.base * (1 + (icms_st.mva / 100.0)));
      icms_st.valor = round2((icms_st.base * (icms_st.aliquota / 100.0)) - icms.valor);
      if (icms_st.valor < 0) icms_st.valor = 0;
      impostosCalculados += icms_st.valor;
    } else {
      icms_st.status = 'NAO_APLICAVEL';
      icms_st.motivo = undefined;
    }
  } else {
    pendencias.push(cIcms ? pIcms : 'Regra de ICMS não encontrada');
  }

  if (regraIpi) {
    if (Number(regraIpi.aliquota) === 0 && !regraIpi.cst.match(/50|00|99/)) {
      ipi.status = 'NAO_APLICAVEL';
    } else {
      ipi.status = 'CALCULADO';
    }
    ipi.motivo = undefined;
    ipi.parametros_pesquisados = undefined;
    ipi.cst = regraIpi.cst;
    ipi.regra_aplicada = regraIpi.nome_regra;
    ipi.origem_regra = resIpi.generica ? 'Regra Genérica' : 'Regra Específica';
    ipi.base = round2(valorTotalBruto);
    ipi.aliquota = Number(regraIpi.aliquota);
    ipi.valor = round2(ipi.base * (ipi.aliquota / 100.0));
    impostosCalculados += ipi.valor;
  }

  if (regraPisCofins) {
    pis.status = 'CALCULADO';
    cofins.status = 'CALCULADO';
    pis.motivo = undefined;
    cofins.motivo = undefined;
    pis.parametros_pesquisados = undefined;
    cofins.parametros_pesquisados = undefined;

    pis.cst = regraPisCofins.cst;
    cofins.cst = regraPisCofins.cst;
    pis.regra_aplicada = regraPisCofins.nome_regra;
    cofins.regra_aplicada = regraPisCofins.nome_regra;
    pis.origem_regra = resPisCofins.generica ? 'Regra Genérica' : 'Regra Específica';
    cofins.origem_regra = resPisCofins.generica ? 'Regra Genérica' : 'Regra Específica';

    pis.base = round2(valorTotalBruto);
    cofins.base = round2(valorTotalBruto);
    pis.aliquota = Number(regraPisCofins.aliquota_pis);
    cofins.aliquota = Number(regraPisCofins.aliquota_cofins);
    pis.valor = round2(pis.base * (pis.aliquota / 100.0));
    cofins.valor = round2(cofins.base * (cofins.aliquota / 100.0));

    if (pis.aliquota === 0 && cofins.aliquota === 0 && !pis.cst.match(/01|02/)) {
      pis.status = 'NAO_APLICAVEL';
      cofins.status = 'NAO_APLICAVEL';
    }

    impostosCalculados += pis.valor + cofins.valor;
  }

  if (regraIbsCbs) {
    ibs.status = 'CALCULADO';
    cbs.status = 'CALCULADO';
    ibs.motivo = undefined;
    cbs.motivo = undefined;
    ibs.parametros_pesquisados = undefined;
    cbs.parametros_pesquisados = undefined;

    ibs.cst = regraIbsCbs.cst;
    cbs.cst = regraIbsCbs.cst;
    ibs.cClassTrib = regraIbsCbs.cClassTrib;
    cbs.cClassTrib = regraIbsCbs.cClassTrib;
    ibs.regra_aplicada = regraIbsCbs.nome_regra;
    cbs.regra_aplicada = regraIbsCbs.nome_regra;
    ibs.origem_regra = resIbsCbs.generica ? 'Regra Genérica' : 'Regra Específica';
    cbs.origem_regra = resIbsCbs.generica ? 'Regra Genérica' : 'Regra Específica';

    ibs.base = round2(valorTotalBruto);
    cbs.base = round2(valorTotalBruto);
    ibs.aliquota = Number(regraIbsCbs.aliquota_ibs);
    cbs.aliquota = Number(regraIbsCbs.aliquota_cbs);
    ibs.valor = round2(ibs.base * (ibs.aliquota / 100.0));
    cbs.valor = round2(cbs.base * (cbs.aliquota / 100.0));

    impostosCalculados += ibs.valor + cbs.valor;
  }

  const cleanObject = (obj) => {
    Object.keys(obj).forEach(key => obj[key] === undefined && delete obj[key]);
    return obj;
  };

  const tributacaoCompleta = pendencias.length === 0;

  return {
    status: tributacaoCompleta ? 'CALCULADO' : 'PENDENTE_TRIBUTACAO',
    pendencias: pendencias.length > 0 ? pendencias : undefined,
    diagnostico: {
      regime: regime,
      uf_origem: uf_origem,
      uf_destino: uf_destino,
      ncm: produto.ncm,
      cest: produto.cest,
      ean_gtin: produto.ean_gtin,
      cfop: params.cfop,
      cst_csosn_informado: params.cst_csosn_informado || null,
      cst_csosn_produto: produto.cst_csosn_padrao || null,
      cClassTrib: produto.cClassTrib || null,
      regras_icms_encontradas: global[`__diag_count_fiscal_regras_icms`] || 0,
      regras_ibs_cbs_encontradas: global[`__diag_count_fiscal_regras_ibs_cbs`] || 0
    },
    produto: {
      id: produto.id,
      codigo: produto.codigo_interno,
      descricao: produto.descricao,
      ncm: produto.ncm,
      cest: produto.cest,
      ean_gtin: produto.ean_gtin,
      origem: produto.origem
    },
    cfop: params.cfop,
    tributacao: {
      icms: cleanObject(icms),
      icms_st: cleanObject(icms_st),
      ipi: cleanObject(ipi),
      pis: cleanObject(pis),
      cofins: cleanObject(cofins),
      ibs: cleanObject(ibs),
      cbs: cleanObject(cbs)
    },
    totais: {
      bruto: valorTotalBruto,
      impostos_calculados: Number(impostosCalculados.toFixed(2)),
      tributacao_completa: tributacaoCompleta,
      total_definitivo: tributacaoCompleta ? Number((valorTotalBruto + (ipi.valor || 0) + (icms_st.valor || 0)).toFixed(2)) : null
    }
  };
}
