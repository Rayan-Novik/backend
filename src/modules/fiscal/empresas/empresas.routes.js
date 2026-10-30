import { Router } from 'express';
import prisma from '../../../config/prisma.js';
import { getTenantId } from '../shared/tenantHelper.js';

export const empresasRouter = Router();

empresasRouter.get('/fix', async (req, res) => {
  const empresas = await prisma.fiscal_empresas.findMany({ include: { estabelecimentos: true } });
  let count = 0;
  for (const e of empresas) {
    if (e.estabelecimentos.length === 0) {
      await prisma.fiscal_estabelecimentos.create({
        data: {
          tenant_id: e.tenant_id,
          empresa_id: e.id,
          cnpj: e.cnpj,
          nome: 'Matriz - ' + e.razao_social,
          ie: e.ie,
          logradouro: e.logradouro,
          numero: e.numero,
          bairro: e.bairro,
          municipio: e.municipio,
          codigo_municipio_ibge: e.codigo_municipio_ibge,
          uf: e.uf,
          cep: e.cep
        }
      });
      count++;
    }
  }
  return res.json({ fixed: count });
});

empresasRouter.post('/', async (req, res) => {
  try {
    const tenant_id = getTenantId(req);
    const {
      id, cnpj, razao_social, nome_fantasia, ie, im, crt, cnae,
      logradouro, numero, bairro, municipio, codigo_municipio_ibge, uf, cep, pais, telefone, email, csc, id_token_csc
    } = req.body;

    let empresa;
    if (id) {
      empresa = await prisma.$transaction(async (tx) => {
        const empresaAtualizada = await tx.fiscal_empresas.update({
          where: { id },
          data: {
            cnpj, razao_social, nome_fantasia, ie, im, crt, cnae,
            logradouro, numero, bairro, municipio, codigo_municipio_ibge, uf, cep, pais, telefone, email
          }
        });

        const estabs = await tx.fiscal_estabelecimentos.findMany({ where: { empresa_id: id } });
        if (estabs.length > 0) {
          await tx.fiscal_estabelecimentos.update({
            where: { id: estabs[0].id },
            data: {
              cnpj,
              nome: 'Matriz - ' + razao_social,
              ie, logradouro, numero, bairro, municipio, codigo_municipio_ibge, uf, cep, csc, id_token_csc
            }
          });
        }
        return empresaAtualizada;
      });
    } else {
      empresa = await prisma.$transaction(async (tx) => {
        const novaEmpresa = await tx.fiscal_empresas.create({
          data: {
            tenant_id, cnpj, razao_social, nome_fantasia, ie, im, crt: crt || 'SIMPLES_NACIONAL', cnae,
            logradouro, numero, bairro, municipio, codigo_municipio_ibge, uf, cep, pais, telefone, email
          }
        });

        await tx.fiscal_estabelecimentos.create({
          data: {
            tenant_id,
            empresa_id: novaEmpresa.id,
            cnpj,
            nome: 'Matriz - ' + razao_social,
            ie, logradouro, numero, bairro, municipio, codigo_municipio_ibge, uf, cep, csc, id_token_csc
          }
        });
        return novaEmpresa;
      });
    }

    return res.json(empresa);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

empresasRouter.get('/', async (req, res) => {
  try {
    const tenant_id = getTenantId(req);

    const empresas = await prisma.fiscal_empresas.findMany({
      where: tenant_id === 'ALL' ? undefined : { tenant_id: String(tenant_id) },
      include: { estabelecimentos: true }
    });

    const result = empresas.map(e => {
      const est = e.estabelecimentos?.[0];
      return {
        ...e,
        estabelecimento_id: est?.id || null,
        csc: est?.csc || '',
        id_token_csc: est?.id_token_csc || ''
      };
    });

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});
