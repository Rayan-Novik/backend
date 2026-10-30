import prisma from '../../../config/prisma.js';

export async function syncProductToFiscal(produtoPrisma, rawData = {}, acao = 'POST') {
  try {
    if (!produtoPrisma) return null;
    const tenant_id = String(produtoPrisma.id_tenant || rawData.tenant_id || 1);
    const codigo_interno = String(produtoPrisma.id_produto);

    if (acao === 'DELETE') {
      const existing = await prisma.fiscal_produtos.findFirst({
        where: {
          tenant_id,
          OR: [
            ...(produtoPrisma.id_fiscal ? [{ id: produtoPrisma.id_fiscal }] : []),
            { codigo_interno }
          ]
        }
      });
      if (existing) {
        try {
          await prisma.fiscal_produtos.delete({ where: { id: existing.id } });
        } catch (_) {
          // Caso já possua notas emitidas vinculadas, mantemos o registro fiscal para integridade histórica
        }
      }
      return null;
    }

    const payloadFiscal = {
      tenant_id,
      codigo_interno,
      ean_gtin: produtoPrisma.id_externo || rawData.ean_gtin || null,
      descricao: String(produtoPrisma.nome || rawData.descricao || 'Produto').substring(0, 120),
      ncm: (String(produtoPrisma.ncm || rawData.ncm || '').replace(/\D/g, '').replace(/^0+$/, '')) || '21069090',
      cest: produtoPrisma.cest || rawData.cest || null,
      unidade_comercial: produtoPrisma.unidade || rawData.unidade_comercial || 'UN',
      unidade_tributavel: produtoPrisma.unidade || rawData.unidade_tributavel || 'UN',
      fator_conversao: 1.0,
      valor_compra: Number(produtoPrisma.preco_custo ?? rawData.valor_compra ?? 0),
      valor_venda: Number(produtoPrisma.preco ?? rawData.valor_venda ?? 0),
      origem: produtoPrisma.origem !== undefined && produtoPrisma.origem !== null ? Number(produtoPrisma.origem) : 0,
      cst_csosn_padrao: rawData.cst_csosn_padrao || produtoPrisma.cst_icms || '102',
      aliquota_icms: Number(rawData.aliquota_icms ?? produtoPrisma.aliq_icms ?? 0),
      aliquota_ipi: Number(rawData.aliquota_ipi ?? produtoPrisma.aliq_ipi ?? 0),
      aliquota_pis: Number(rawData.aliquota_pis ?? produtoPrisma.aliq_pis ?? 0),
      aliquota_cofins: Number(rawData.aliquota_cofins ?? produtoPrisma.aliq_cofins ?? 0),
      cClassTrib: rawData.cClassTrib || produtoPrisma.cClassTrib || '410001',
      aliquota_ibs: Number(rawData.aliquota_ibs ?? produtoPrisma.aliq_ibs ?? 0),
      aliquota_cbs: Number(rawData.aliquota_cbs ?? produtoPrisma.aliq_cbs ?? 0)
    };

    let existing = null;
    if (produtoPrisma.id_fiscal) {
      existing = await prisma.fiscal_produtos.findUnique({ where: { id: produtoPrisma.id_fiscal } });
    }
    if (!existing) {
      existing = await prisma.fiscal_produtos.findFirst({
        where: { tenant_id, codigo_interno }
      });
    }

    let record;
    if (existing) {
      const { tenant_id: _t, ...updateData } = payloadFiscal;
      record = await prisma.fiscal_produtos.update({
        where: { id: existing.id },
        data: updateData
      });
    } else {
      record = await prisma.fiscal_produtos.create({
        data: payloadFiscal
      });
    }

    return record.id;
  } catch (error) {
    console.error(`❌ [Fiscal Sync Error - ${acao}]`, error.message);
    return null;
  }
}

export async function resolveFiscalProduct(tenant_id, idOrCodigo) {
  const tenantStr = String(tenant_id);
  const keyStr = String(idOrCodigo);

  // 1. Busca pelo UUID em fiscal_produtos
  let fiscalProd = await prisma.fiscal_produtos.findUnique({
    where: { id: keyStr }
  });
  if (fiscalProd) return fiscalProd;

  // 2. Busca pelo codigo_interno em fiscal_produtos
  fiscalProd = await prisma.fiscal_produtos.findFirst({
    where: { tenant_id: tenantStr, codigo_interno: keyStr }
  });
  if (fiscalProd) return fiscalProd;

  // 3. Busca em produtos do www e sincroniza automaticamente
  const isNumeric = /^\d+$/.test(keyStr);
  const wwwProd = await prisma.produtos.findFirst({
    where: {
      id_tenant: Number(tenant_id) || 1,
      OR: [
        ...(isNumeric ? [{ id_produto: Number(keyStr) }] : []),
        { id_fiscal: keyStr },
        { id_externo: keyStr }
      ]
    }
  });

  if (wwwProd) {
    const uuid = await syncProductToFiscal(wwwProd, {}, 'POST');
    if (uuid) {
      if (wwwProd.id_fiscal !== uuid) {
        await prisma.produtos.update({
          where: { id_produto: wwwProd.id_produto },
          data: { id_fiscal: uuid }
        });
      }
      return await prisma.fiscal_produtos.findUnique({ where: { id: uuid } });
    }
  }

  return null;
}
