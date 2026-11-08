import { Router } from 'express';
import forge from 'node-forge';
import * as spedPdf from 'node-sped-pdf';
import prisma from '../../../config/prisma.js';
import { NFeService } from '../services/NFeService.js';
import { NFeEventosService } from '../services/NFeEventosService.js';
import { calcularImpostosItem } from '../regras-tributarias/calcular.js';
import { decrypt } from '../shared/encryption.js';
import { getTrueDate } from '../shared/time-sync.js';
import { getSefazUrl } from './sefaz-urls.js';
import { montarXmlNFe, gerarChaveAcesso } from './nfe-builder.js';
import { assinarXml } from './nfe-signer.js';
import { enviarSefaz } from './sefaz-client.js';
import { fiscalEvents } from '../shared/events.js';
import { getTenantId } from '../shared/tenantHelper.js';

export const notasRouter = Router();

notasRouter.get('/hora-oficial', async (req, res) => {
  try {
    const trueDate = await getTrueDate();
    return res.json({ datetime: trueDate.toISOString() });
  } catch (e) {
    return res.status(500).json({ error: 'Erro ao buscar hora oficial' });
  }
});

notasRouter.post('/:id/corrigir-data', async (req, res) => {
  try {
    const { id } = req.params;
    const nota = await prisma.fiscal_notas.findUnique({ where: { id } });
    if (!nota) return res.status(404).json({ error: 'Nota não encontrada' });

    const { nova_data } = req.body;
    const novaData = nova_data ? new Date(nova_data) : await getTrueDate();

    await prisma.fiscal_notas.update({
      where: { id },
      data: { data_emissao: novaData }
    });

    return res.json({ message: 'Data corrigida com sucesso', data_emissao: novaData });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

notasRouter.get('/', async (req, res) => {
  try {
    const tenant_id = getTenantId(req);
    const { modelo, status, dia, data_inicio, data_fim, operador, caixa } = req.query;

    const where = { tenant_id: String(tenant_id) };

    if (modelo && modelo !== 'TODAS' && modelo !== 'TODOS') {
      where.modelo = String(modelo);
    }
    if (status && status !== 'TODOS' && status !== 'TODAS') {
      where.status = String(status).toUpperCase();
    }
    if (dia) {
      const diaStr = String(dia).trim();
      const dInicio = new Date(`${diaStr}T00:00:00.000`);
      const dFim = new Date(`${diaStr}T23:59:59.999`);
      where.data_emissao = { gte: dInicio, lte: dFim };
    } else if (data_inicio || data_fim) {
      where.data_emissao = {};
      if (data_inicio) where.data_emissao.gte = new Date(`${data_inicio}T00:00:00.000`);
      if (data_fim) where.data_emissao.lte = new Date(`${data_fim}T23:59:59.999`);
    }

    const notasRaw = await prisma.fiscal_notas.findMany({
      where,
      orderBy: { data_emissao: 'desc' },
      include: { itens: true, referenciados: true }
    });

    const destinatarioIds = [...new Set(notasRaw.map(n => n.destinatario_id).filter(Boolean))];
    const destinatarios = destinatarioIds.length > 0
      ? await prisma.fiscal_destinatarios.findMany({
          where: { id: { in: destinatarioIds } },
          select: { id: true, razao_social: true, cpf_cnpj: true }
        })
      : [];

    const serieIds = [...new Set(notasRaw.map(n => n.serie_id).filter(Boolean))];
    const series = serieIds.length > 0
      ? await prisma.fiscal_series.findMany({
          where: { id: { in: serieIds } },
          select: { id: true, serie: true }
        })
      : [];

    const pedidoIds = [...new Set(notasRaw.map(n => n.id_pedido).filter(Boolean))];
    const pedidos = pedidoIds.length > 0
      ? await prisma.pedidos.findMany({
          where: { id_pedido: { in: pedidoIds } },
          select: {
            id_pedido: true,
            id_caixa_pdv: true,
            nome_atendente: true,
            data_pedido: true,
            usuarios: { select: { nome_completo: true } },
            caixa_pdv: {
              select: {
                id_caixa: true,
                funcionarios: { select: { id_funcionario: true, nome_completo: true } }
              }
            }
          }
        })
      : [];

    const destMap = {};
    destinatarios.forEach(d => { destMap[d.id] = d; });

    const serieMap = {};
    series.forEach(s => { serieMap[s.id] = s.serie; });

    const pedidoMap = {};
    pedidos.forEach(p => { pedidoMap[p.id_pedido] = p; });

    let notas = notasRaw.map(n => {
      const dest = n.destinatario_id ? destMap[n.destinatario_id] : null;
      const ped = n.id_pedido ? pedidoMap[n.id_pedido] : null;
      const operadorNome = ped?.nome_atendente || ped?.caixa_pdv?.funcionarios?.nome_completo || 'Balcão / Caixa';
      const caixaNumero = ped?.caixa_pdv?.id_caixa ? String(ped.caixa_pdv.id_caixa) : (ped?.id_caixa_pdv ? String(ped.id_caixa_pdv) : '01');

      return {
        ...n,
        serie: serieMap[n.serie_id] || 1,
        destinatario: dest,
        destinatario_nome: dest?.razao_social || null,
        operador_nome: operadorNome,
        caixa_numero: caixaNumero,
        id_caixa_pdv: ped?.id_caixa_pdv || null
      };
    });

    if (operador && operador.trim()) {
      const opFiltro = operador.toLowerCase().trim();
      notas = notas.filter(n => (n.operador_nome || '').toLowerCase().includes(opFiltro));
    }

    if (caixa && caixa.trim()) {
      const cxFiltro = caixa.trim();
      notas = notas.filter(n => String(n.caixa_numero) === cxFiltro || String(n.id_caixa_pdv) === cxFiltro);
    }

    return res.json(notas);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

notasRouter.post('/emitir', async (req, res) => {
  try {
    const tenant_id = getTenantId(req);
    const {
      estabelecimento_id,
      cenario_id,
      destinatario_id,
      itens,
      ambiente = 2,
      modalidade_frete = 9,
      apenas_salvar,
      contingencia,
      forma_pagamento_id,
      id_pedido
    } = req.body;

    if (!estabelecimento_id || !cenario_id || !itens || !itens.length) {
      return res.status(400).json({ error: 'Parâmetros insuficientes para emissão' });
    }

    const result = await NFeService.emitir(
      tenant_id,
      estabelecimento_id,
      cenario_id,
      destinatario_id,
      itens,
      { modalidade_frete, ambiente, apenas_salvar, contingencia, forma_pagamento_id, id_pedido }
    );

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

notasRouter.post('/devolucao', async (req, res) => {
  try {
    const tenant_id = getTenantId(req);
    const {
      estabelecimento_id,
      nota_original_id,
      cenario_id,
      itens,
      justificativa
    } = req.body;

    if (!estabelecimento_id || !nota_original_id || !cenario_id || !itens || !itens.length) {
      return res.status(400).json({ error: 'Parâmetros insuficientes para devolução' });
    }

    const notaOriginal = await prisma.fiscal_notas.findFirst({
      where: { id: nota_original_id, tenant_id },
      include: { itens: true }
    });

    if (!notaOriginal) return res.status(404).json({ error: 'Nota original não encontrada ou não pertence ao tenant.' });
    if (notaOriginal.status !== 'AUTORIZADA') return res.status(400).json({ error: 'Só é possível devolver contra uma nota AUTORIZADA.' });

    const itensParaDevolver = [];
    for (const itemReq of itens) {
      const itemOriginal = notaOriginal.itens.find(i => i.produto_id === itemReq.produto_id);
      if (!itemOriginal) {
        return res.status(400).json({ error: `O produto ${itemReq.produto_id} não faz parte da nota original.` });
      }

      const devolucoesAnteriores = await prisma.fiscal_nota_itens.aggregate({
        _sum: { quantidade: true },
        where: {
          item_original_id: itemOriginal.id,
          nota: { status: 'AUTORIZADA' }
        }
      });

      const qtdJaDevolvida = devolucoesAnteriores._sum.quantidade ? Number(devolucoesAnteriores._sum.quantidade) : 0;
      const qtdRestante = Number(itemOriginal.quantidade) - qtdJaDevolvida;
      const qtdSolicitada = Number(itemReq.quantidade_devolver);

      if (qtdSolicitada > qtdRestante) {
        return res.status(400).json({
          error: `Quantidade a devolver excede o limite. Produto: ${itemReq.produto_id}, Original: ${itemOriginal.quantidade}, Já devolvido: ${qtdJaDevolvida}, Solicitado: ${qtdSolicitada}.`
        });
      }

      itensParaDevolver.push({
        ...itemOriginal,
        item_original_id: itemOriginal.id,
        quantidade_devolver: qtdSolicitada,
        valor_unitario: Number(itemOriginal.valor_unitario)
      });
    }

    const estabelecimento = await prisma.fiscal_estabelecimentos.findUnique({ where: { id: estabelecimento_id }, include: { empresa: true } });
    if (!estabelecimento) throw new Error('Estabelecimento não encontrado');
    const empresa = estabelecimento.empresa;

    const cenario = await prisma.fiscal_cenarios_fiscais.findUnique({ where: { id: cenario_id } });
    if (!cenario) throw new Error('Cenário fiscal não encontrado');
    if (cenario.finalidade !== 4) throw new Error('O cenário fiscal informado não é de devolução (finalidade != 4).');

    if (!notaOriginal.destinatario_id) throw new Error('A nota original não possui destinatário atrelado.');
    const destinatario = await prisma.fiscal_destinatarios.findUnique({ where: { id: notaOriginal.destinatario_id } });
    if (!destinatario) throw new Error('Destinatário não encontrado');

    const certificadoAtivo = await prisma.fiscal_certificados.findFirst({ where: { estabelecimento_id, ativo: true } });
    if (!certificadoAtivo) throw new Error('Nenhum certificado ativo encontrado para este estabelecimento');

    const pfxBase64String = decrypt(certificadoAtivo.certificado_base64, certificadoAtivo.certificado_iv, certificadoAtivo.certificado_auth_tag);
    const pfxBuffer = Buffer.from(pfxBase64String, 'base64');
    const senhaStr = decrypt(certificadoAtivo.senha_criptografada, certificadoAtivo.senha_iv, certificadoAtivo.senha_auth_tag);
    const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, senhaStr);

    let privateKeyPem = '', certPem = '';
    for (const safeContents of p12.safeContents) {
      for (const safeBag of safeContents.safeBags) {
        if (safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag && safeBag.key) privateKeyPem = forge.pki.privateKeyToPem(safeBag.key);
        else if (safeBag.type === forge.pki.oids.certBag && safeBag.cert) certPem = forge.pki.certificateToPem(safeBag.cert);
      }
    }
    if (!privateKeyPem || !certPem) throw new Error('Falha ao extrair chaves do certificado');

    const { serieRec, numeroGerado } = await NFeService.obterProximoNumeroSerie(tenant_id, estabelecimento_id, cenario.modelo, 1);

    const dataEmissao = new Date();
    const itensCalculados = [];
    let valorTotalProdutos = 0;

    const cNF = Math.floor(Math.random() * 99999999).toString();
    const chaveAcesso = gerarChaveAcesso(
      (estabelecimento.codigo_municipio_ibge || empresa.codigo_municipio_ibge || '1302603').substring(0, 2),
      dataEmissao,
      estabelecimento.cnpj,
      cenario.modelo,
      serieRec.serie.toString(),
      numeroGerado.toString(),
      '1',
      cNF
    );

    let numeroItem = 1;
    for (const item of itensParaDevolver) {
      const calcResult = await calcularImpostosItem({
        tenant_id,
        produto_id: item.produto_id,
        empresa_id: estabelecimento.empresa_id,
        uf_origem: empresa.uf,
        uf_destino: destinatario.uf,
        tipo_cliente: destinatario.tipo_contribuinte,
        finalidade: 4,
        cfop: cenario.cfop_padrao || item.cfop,
        ncm: item.ncm,
        cst_csosn_informado: item.icms_cst_csosn,
        valor_produto: item.valor_unitario,
        quantidade: item.quantidade_devolver,
        desconto: 0, frete: 0, seguro: 0, outros: 0
      });

      if (calcResult.status === 'PENDENTE_TRIBUTACAO') {
        return res.status(422).json({ error: 'Tributação pendente para um ou mais produtos.', pendencias: calcResult.pendencias });
      }

      const vTotal = Number((item.valor_unitario * item.quantidade_devolver).toFixed(2));
      valorTotalProdutos += vTotal;

      itensCalculados.push({
        tenant_id,
        numero_item: numeroItem++,
        produto_id: item.produto_id,
        codigo_produto: item.codigo_produto,
        descricao_produto: item.descricao_produto,
        cfop: calcResult.cfop,
        ncm: item.ncm,
        cest: item.cest,
        origem: item.origem,
        quantidade: item.quantidade_devolver,
        valor_unitario: item.valor_unitario,
        valor_total: vTotal,
        valor_desconto: 0, valor_frete: 0, valor_seguro: 0, valor_outras: 0,
        icms_cst_csosn: calcResult.tributacao.icms.status === 'CALCULADO' ? calcResult.tributacao.icms.cst_csosn : '',
        icms_base: calcResult.tributacao.icms.status === 'CALCULADO' ? calcResult.tributacao.icms.base : 0,
        icms_aliquota: calcResult.tributacao.icms.status === 'CALCULADO' ? calcResult.tributacao.icms.aliquota : 0,
        icms_valor: calcResult.tributacao.icms.status === 'CALCULADO' ? calcResult.tributacao.icms.valor : 0,
        icms_st_base: calcResult.tributacao.icms_st.status === 'CALCULADO' ? calcResult.tributacao.icms_st.base : 0,
        icms_st_aliquota: calcResult.tributacao.icms_st.status === 'CALCULADO' ? calcResult.tributacao.icms_st.aliquota : 0,
        icms_st_valor: calcResult.tributacao.icms_st.status === 'CALCULADO' ? calcResult.tributacao.icms_st.valor : 0,
        ipi_cst: calcResult.tributacao.ipi.status === 'CALCULADO' ? calcResult.tributacao.ipi.cst : '',
        ipi_base: calcResult.tributacao.ipi.status === 'CALCULADO' ? calcResult.tributacao.ipi.base : 0,
        ipi_aliquota: calcResult.tributacao.ipi.status === 'CALCULADO' ? calcResult.tributacao.ipi.aliquota : 0,
        ipi_valor: calcResult.tributacao.ipi.status === 'CALCULADO' ? calcResult.tributacao.ipi.valor : 0,
        pis_cst: calcResult.tributacao.pis.status === 'CALCULADO' ? calcResult.tributacao.pis.cst : '',
        pis_base: calcResult.tributacao.pis.status === 'CALCULADO' ? calcResult.tributacao.pis.base : 0,
        pis_aliquota: calcResult.tributacao.pis.status === 'CALCULADO' ? calcResult.tributacao.pis.aliquota : 0,
        pis_valor: calcResult.tributacao.pis.status === 'CALCULADO' ? calcResult.tributacao.pis.valor : 0,
        cofins_cst: calcResult.tributacao.cofins.status === 'CALCULADO' ? calcResult.tributacao.cofins.cst : '',
        cofins_base: calcResult.tributacao.cofins.status === 'CALCULADO' ? calcResult.tributacao.cofins.base : 0,
        cofins_aliquota: calcResult.tributacao.cofins.status === 'CALCULADO' ? calcResult.tributacao.cofins.aliquota : 0,
        cofins_valor: calcResult.tributacao.cofins.status === 'CALCULADO' ? calcResult.tributacao.cofins.valor : 0,
        ibs_cst: calcResult.tributacao.ibs.status === 'CALCULADO' ? calcResult.tributacao.ibs.cst : '',
        ibs_base: calcResult.tributacao.ibs.status === 'CALCULADO' ? calcResult.tributacao.ibs.base : 0,
        ibs_aliquota: calcResult.tributacao.ibs.status === 'CALCULADO' ? calcResult.tributacao.ibs.aliquota : 0,
        ibs_valor: calcResult.tributacao.ibs.status === 'CALCULADO' ? calcResult.tributacao.ibs.valor : 0,
        cbs_cst: calcResult.tributacao.cbs.status === 'CALCULADO' ? calcResult.tributacao.cbs.cst : '',
        cbs_base: calcResult.tributacao.cbs.status === 'CALCULADO' ? calcResult.tributacao.cbs.base : 0,
        cbs_aliquota: calcResult.tributacao.cbs.status === 'CALCULADO' ? calcResult.tributacao.cbs.aliquota : 0,
        cbs_valor: calcResult.tributacao.cbs.status === 'CALCULADO' ? calcResult.tributacao.cbs.valor : 0,
        cClassTrib: calcResult.tributacao.ibs.cClassTrib,
        item_original_id: item.item_original_id
      });
    }

    const notaFiscal = await prisma.fiscal_notas.create({
      data: {
        tenant_id,
        estabelecimento_id,
        cenario_id,
        destinatario_id: notaOriginal.destinatario_id,
        serie_id: serieRec.id,
        modelo: cenario.modelo,
        numero: numeroGerado,
        chave_acesso: chaveAcesso,
        ambiente: 2,
        tipo: notaOriginal.tipo === 1 ? 0 : 1,
        finalidade: 4,
        natureza_operacao: cenario.operacao,
        data_emissao: dataEmissao,
        status: 'PROCESSANDO',
        valor_total_produtos: valorTotalProdutos,
        valor_frete: 0, valor_seguro: 0, valor_desconto: 0, valor_outras: 0,
        valor_total_nota: valorTotalProdutos,
        itens: { create: itensCalculados },
        referenciados: {
          create: {
            tenant_id,
            chave_acesso: notaOriginal.chave_acesso,
            tipo_referencia: 'DEVOLUCAO'
          }
        }
      },
      include: { referenciados: true }
    });

    const xmlBruto = montarXmlNFe({ ...notaFiscal, serie: serieRec.serie }, empresa, estabelecimento, destinatario, itensCalculados, notaFiscal.referenciados);
    const xmlAssinado = assinarXml(xmlBruto, privateKeyPem, certPem, `NFe${notaFiscal.chave_acesso}`, 'infNFe');

    await prisma.fiscal_notas.update({
      where: { id: notaFiscal.id },
      data: { xml_gerado: xmlBruto, xml_assinado: xmlAssinado }
    });

    const cleanXml = xmlAssinado.replace(/^<\?xml[^>]+>\s*/i, '');
    const uf = estabelecimento.uf || empresa.uf;
    const wsdlUrl = getSefazUrl(uf, 2, 'NFeAutorizacao');
    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4"><enviNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><idLote>1</idLote><indSinc>1</indSinc>${cleanXml}</enviNFe></nfeDadosMsg></soap12:Body></soap12:Envelope>`;

    try {
      await enviarSefaz(soapEnvelope, wsdlUrl, pfxBuffer, senhaStr);
      await prisma.fiscal_notas.update({
        where: { id: notaFiscal.id },
        data: {
          status: 'AUTORIZADA',
          codigo_status_sefaz: '100',
          motivo_status_sefaz: 'Autorizado o uso da NF-e',
          xml_autorizado: xmlAssinado
        }
      });

      fiscalEvents.emit('onNotaAutorizada', {
        nota_id: notaFiscal.id,
        tenant_id,
        chave_acesso: chaveAcesso,
        movimenta_estoque: cenario.movimenta_estoque,
        gera_financeiro: cenario.gera_financeiro,
        itens: itensCalculados
      });

      return res.json({ message: 'Devolução Emitida', numero: numeroGerado, status: 'AUTORIZADA', id: notaFiscal.id });
    } catch (e) {
      await prisma.fiscal_notas.update({
        where: { id: notaFiscal.id },
        data: { status: 'REJEITADA', codigo_status_sefaz: null, motivo_status_sefaz: 'Falha no envio (mTLS/Rede): ' + e.message }
      });
      return res.status(422).json({ error: 'Rejeitada pela Sefaz', motivo: e.message, numero: numeroGerado });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

notasRouter.post('/complementar', async (req, res) => {
  try {
    const tenant_id = getTenantId(req);
    const { estabelecimento_id, nota_original_id, cenario_id, itens } = req.body;
    if (!estabelecimento_id || !nota_original_id || !cenario_id || !itens || !itens.length) {
      return res.status(400).json({ error: 'Parâmetros obrigatórios faltando' });
    }

    const notaOriginal = await prisma.fiscal_notas.findUnique({ where: { id: nota_original_id } });
    if (!notaOriginal) throw new Error('Nota original não encontrada');
    if (notaOriginal.status !== 'AUTORIZADA') throw new Error('Só é possível emitir nota complementar de nota AUTORIZADA');

    const estabelecimento = await prisma.fiscal_estabelecimentos.findUnique({ where: { id: estabelecimento_id }, include: { empresa: true } });
    if (!estabelecimento) throw new Error('Estabelecimento não encontrado');
    const empresa = estabelecimento.empresa;

    const cenario = await prisma.fiscal_cenarios_fiscais.findUnique({ where: { id: cenario_id } });
    if (!cenario) throw new Error('Cenário fiscal não encontrado');
    if (cenario.finalidade !== 2) throw new Error('O cenário fiscal informado não é de nota complementar (finalidade != 2).');

    if (!notaOriginal.destinatario_id) throw new Error('A nota original não possui destinatário atrelado.');
    const destinatario = await prisma.fiscal_destinatarios.findUnique({ where: { id: notaOriginal.destinatario_id } });
    if (!destinatario) throw new Error('Destinatário não encontrado');

    const certificadoAtivo = await prisma.fiscal_certificados.findFirst({ where: { estabelecimento_id, ativo: true } });
    if (!certificadoAtivo) throw new Error('Nenhum certificado ativo encontrado para este estabelecimento');

    const pfxBase64String = decrypt(certificadoAtivo.certificado_base64, certificadoAtivo.certificado_iv, certificadoAtivo.certificado_auth_tag);
    const pfxBuffer = Buffer.from(pfxBase64String, 'base64');
    const senhaStr = decrypt(certificadoAtivo.senha_criptografada, certificadoAtivo.senha_iv, certificadoAtivo.senha_auth_tag);
    const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, senhaStr);

    let privateKeyPem = '', certPem = '';
    for (const safeContents of p12.safeContents) {
      for (const safeBag of safeContents.safeBags) {
        if (safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag && safeBag.key) privateKeyPem = forge.pki.privateKeyToPem(safeBag.key);
        else if (safeBag.type === forge.pki.oids.certBag && safeBag.cert) certPem = forge.pki.certificateToPem(safeBag.cert);
      }
    }
    if (!privateKeyPem || !certPem) throw new Error('Falha ao extrair chaves do certificado');

    const { serieRec, numeroGerado } = await NFeService.obterProximoNumeroSerie(tenant_id, estabelecimento_id, cenario.modelo, 1);

    const dataEmissao = new Date();
    const itensCalculados = [];
    let valorTotalProdutos = 0;

    const cNF = Math.floor(Math.random() * 99999999).toString();
    const chaveAcesso = gerarChaveAcesso(
      (estabelecimento.codigo_municipio_ibge || empresa.codigo_municipio_ibge || '1302603').substring(0, 2),
      dataEmissao, estabelecimento.cnpj, cenario.modelo, serieRec.serie.toString(),
      numeroGerado.toString(), '1', cNF
    );

    let numeroItem = 1;
    for (const item of itens) {
      let calcResult;
      if (item.manual_taxes) {
        calcResult = {
          cfop: cenario.cfop_padrao || item.cfop,
          tributacao: {
            icms: { status: 'CALCULADO', cst_csosn: item.icms_cst_csosn || '', base: item.icms_base || 0, aliquota: item.icms_aliquota || 0, valor: item.icms_valor || 0 },
            icms_st: { status: 'CALCULADO', base: item.icms_st_base || 0, aliquota: item.icms_st_aliquota || 0, valor: item.icms_st_valor || 0 },
            ipi: { status: 'CALCULADO', cst: item.ipi_cst || '', base: item.ipi_base || 0, aliquota: item.ipi_aliquota || 0, valor: item.ipi_valor || 0 },
            pis: { status: 'CALCULADO', cst: item.pis_cst || '', base: item.pis_base || 0, aliquota: item.pis_aliquota || 0, valor: item.pis_valor || 0 },
            cofins: { status: 'CALCULADO', cst: item.cofins_cst || '', base: item.cofins_base || 0, aliquota: item.cofins_aliquota || 0, valor: item.cofins_valor || 0 },
            ibs: { status: 'CALCULADO', cst: item.ibs_cst || '', base: item.ibs_base || 0, aliquota: item.ibs_aliquota || 0, valor: item.ibs_valor || 0, cClassTrib: item.cClassTrib || '' },
            cbs: { status: 'CALCULADO', cst: item.cbs_cst || '', base: item.cbs_base || 0, aliquota: item.cbs_aliquota || 0, valor: item.cbs_valor || 0 }
          }
        };
      } else {
        calcResult = await calcularImpostosItem({
          tenant_id,
          produto_id: item.produto_id,
          empresa_id: estabelecimento.empresa_id,
          uf_origem: empresa.uf,
          uf_destino: destinatario.uf,
          tipo_cliente: destinatario.tipo_contribuinte,
          finalidade: 2,
          cfop: cenario.cfop_padrao || item.cfop,
          ncm: item.ncm,
          cst_csosn_informado: item.icms_cst_csosn,
          valor_produto: item.valor_unitario,
          quantidade: 1,
          desconto: 0, frete: 0, seguro: 0, outros: 0
        });
        if (calcResult.status === 'PENDENTE_TRIBUTACAO') {
          return res.status(422).json({ error: 'Tributação pendente para um ou mais produtos.', pendencias: calcResult.pendencias });
        }
      }

      const vTotal = Number((Number(item.valor_unitario) * 1).toFixed(2));
      valorTotalProdutos += vTotal;

      itensCalculados.push({
        tenant_id,
        numero_item: numeroItem++,
        produto_id: item.produto_id,
        codigo_produto: item.codigo_produto || String(item.produto_id),
        descricao_produto: item.descricao_produto || 'Complemento Fiscal',
        cfop: calcResult.cfop,
        ncm: item.ncm || '00000000',
        cest: item.cest,
        origem: item.origem || 0,
        quantidade: 0,
        valor_unitario: 0,
        valor_total: vTotal,
        valor_desconto: 0, valor_frete: 0, valor_seguro: 0, valor_outras: 0,
        icms_cst_csosn: calcResult.tributacao.icms.status === 'CALCULADO' ? calcResult.tributacao.icms.cst_csosn : '',
        icms_base: calcResult.tributacao.icms.status === 'CALCULADO' ? calcResult.tributacao.icms.base : 0,
        icms_aliquota: calcResult.tributacao.icms.status === 'CALCULADO' ? calcResult.tributacao.icms.aliquota : 0,
        icms_valor: calcResult.tributacao.icms.status === 'CALCULADO' ? calcResult.tributacao.icms.valor : 0,
        icms_st_base: calcResult.tributacao.icms_st.status === 'CALCULADO' ? calcResult.tributacao.icms_st.base : 0,
        icms_st_aliquota: calcResult.tributacao.icms_st.status === 'CALCULADO' ? calcResult.tributacao.icms_st.aliquota : 0,
        icms_st_valor: calcResult.tributacao.icms_st.status === 'CALCULADO' ? calcResult.tributacao.icms_st.valor : 0,
        ipi_cst: calcResult.tributacao.ipi.status === 'CALCULADO' ? calcResult.tributacao.ipi.cst : '',
        ipi_base: calcResult.tributacao.ipi.status === 'CALCULADO' ? calcResult.tributacao.ipi.base : 0,
        ipi_aliquota: calcResult.tributacao.ipi.status === 'CALCULADO' ? calcResult.tributacao.ipi.aliquota : 0,
        ipi_valor: calcResult.tributacao.ipi.status === 'CALCULADO' ? calcResult.tributacao.ipi.valor : 0,
        pis_cst: calcResult.tributacao.pis.status === 'CALCULADO' ? calcResult.tributacao.pis.cst : '',
        pis_base: calcResult.tributacao.pis.status === 'CALCULADO' ? calcResult.tributacao.pis.base : 0,
        pis_aliquota: calcResult.tributacao.pis.status === 'CALCULADO' ? calcResult.tributacao.pis.aliquota : 0,
        pis_valor: calcResult.tributacao.pis.status === 'CALCULADO' ? calcResult.tributacao.pis.valor : 0,
        cofins_cst: calcResult.tributacao.cofins.status === 'CALCULADO' ? calcResult.tributacao.cofins.cst : '',
        cofins_base: calcResult.tributacao.cofins.status === 'CALCULADO' ? calcResult.tributacao.cofins.base : 0,
        cofins_aliquota: calcResult.tributacao.cofins.status === 'CALCULADO' ? calcResult.tributacao.cofins.aliquota : 0,
        cofins_valor: calcResult.tributacao.cofins.status === 'CALCULADO' ? calcResult.tributacao.cofins.valor : 0,
        ibs_cst: calcResult.tributacao.ibs.status === 'CALCULADO' ? calcResult.tributacao.ibs.cst : '',
        ibs_base: calcResult.tributacao.ibs.status === 'CALCULADO' ? calcResult.tributacao.ibs.base : 0,
        ibs_aliquota: calcResult.tributacao.ibs.status === 'CALCULADO' ? calcResult.tributacao.ibs.aliquota : 0,
        ibs_valor: calcResult.tributacao.ibs.status === 'CALCULADO' ? calcResult.tributacao.ibs.valor : 0,
        cbs_cst: calcResult.tributacao.cbs.status === 'CALCULADO' ? calcResult.tributacao.cbs.cst : '',
        cbs_base: calcResult.tributacao.cbs.status === 'CALCULADO' ? calcResult.tributacao.cbs.base : 0,
        cbs_aliquota: calcResult.tributacao.cbs.status === 'CALCULADO' ? calcResult.tributacao.cbs.aliquota : 0,
        cbs_valor: calcResult.tributacao.cbs.status === 'CALCULADO' ? calcResult.tributacao.cbs.valor : 0,
        cClassTrib: calcResult.tributacao.ibs?.cClassTrib,
        item_original_id: item.item_original_id
      });
    }

    const notaFiscal = await prisma.fiscal_notas.create({
      data: {
        tenant_id, estabelecimento_id, cenario_id, destinatario_id: notaOriginal.destinatario_id,
        serie_id: serieRec.id, modelo: cenario.modelo, numero: numeroGerado, chave_acesso: chaveAcesso,
        ambiente: 2, tipo: notaOriginal.tipo, finalidade: 2,
        natureza_operacao: cenario.operacao, data_emissao: dataEmissao, status: 'PROCESSANDO',
        valor_total_produtos: valorTotalProdutos,
        valor_frete: 0, valor_seguro: 0, valor_desconto: 0, valor_outras: 0,
        valor_total_nota: valorTotalProdutos,
        itens: { create: itensCalculados },
        referenciados: {
          create: {
            tenant_id,
            chave_acesso: notaOriginal.chave_acesso,
            tipo_referencia: 'COMPLEMENTAR'
          }
        }
      },
      include: { referenciados: true }
    });

    const xmlBruto = montarXmlNFe({ ...notaFiscal, serie: serieRec.serie }, empresa, estabelecimento, destinatario, itensCalculados, notaFiscal.referenciados);
    const xmlAssinado = assinarXml(xmlBruto, privateKeyPem, certPem, `NFe${notaFiscal.chave_acesso}`, 'infNFe');

    await prisma.fiscal_notas.update({
      where: { id: notaFiscal.id },
      data: { xml_gerado: xmlBruto, xml_assinado: xmlAssinado }
    });

    const cleanXml = xmlAssinado.replace(/^<\?xml[^>]+>\s*/i, '');
    const uf = estabelecimento.uf || empresa.uf;
    const wsdlUrl = getSefazUrl(uf, 2, 'NFeAutorizacao');
    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4"><enviNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><idLote>1</idLote><indSinc>1</indSinc>${cleanXml}</enviNFe></nfeDadosMsg></soap12:Body></soap12:Envelope>`;

    try {
      await enviarSefaz(soapEnvelope, wsdlUrl, pfxBuffer, senhaStr);
      await prisma.fiscal_notas.update({
        where: { id: notaFiscal.id },
        data: { status: 'AUTORIZADA', codigo_status_sefaz: '100', motivo_status_sefaz: 'Autorizado o uso da NF-e', xml_autorizado: xmlAssinado }
      });
      return res.json({ message: 'Nota Complementar Emitida', numero: numeroGerado, status: 'AUTORIZADA', id: notaFiscal.id });
    } catch (e) {
      await prisma.fiscal_notas.update({
        where: { id: notaFiscal.id },
        data: { status: 'REJEITADA', codigo_status_sefaz: null, motivo_status_sefaz: 'Falha no envio (mTLS/Rede): ' + e.message }
      });
      return res.status(422).json({ error: 'Rejeitada pela Sefaz', motivo: e.message, numero: numeroGerado });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

notasRouter.post('/ajuste', async (req, res) => {
  try {
    const tenant_id = getTenantId(req);
    const { estabelecimento_id, nota_original_id, cenario_id, itens } = req.body;
    if (!estabelecimento_id || !nota_original_id || !cenario_id || !itens || !itens.length) {
      return res.status(400).json({ error: 'Parâmetros obrigatórios faltando' });
    }

    const notaOriginal = await prisma.fiscal_notas.findUnique({ where: { id: nota_original_id } });
    if (!notaOriginal) throw new Error('Nota original não encontrada');
    if (notaOriginal.status !== 'AUTORIZADA') throw new Error('Só é possível emitir nota de ajuste de nota AUTORIZADA');

    const estabelecimento = await prisma.fiscal_estabelecimentos.findUnique({ where: { id: estabelecimento_id }, include: { empresa: true } });
    if (!estabelecimento) throw new Error('Estabelecimento não encontrado');
    const empresa = estabelecimento.empresa;

    const cenario = await prisma.fiscal_cenarios_fiscais.findUnique({ where: { id: cenario_id } });
    if (!cenario) throw new Error('Cenário fiscal não encontrado');
    if (cenario.finalidade !== 3) throw new Error('O cenário fiscal informado não é de nota de ajuste (finalidade != 3).');

    if (!notaOriginal.destinatario_id) throw new Error('A nota original não possui destinatário atrelado.');
    const destinatario = await prisma.fiscal_destinatarios.findUnique({ where: { id: notaOriginal.destinatario_id } });
    if (!destinatario) throw new Error('Destinatário não encontrado');

    const certificadoAtivo = await prisma.fiscal_certificados.findFirst({ where: { estabelecimento_id, ativo: true } });
    if (!certificadoAtivo) throw new Error('Nenhum certificado ativo encontrado para este estabelecimento');

    const pfxBase64String = decrypt(certificadoAtivo.certificado_base64, certificadoAtivo.certificado_iv, certificadoAtivo.certificado_auth_tag);
    const pfxBuffer = Buffer.from(pfxBase64String, 'base64');
    const senhaStr = decrypt(certificadoAtivo.senha_criptografada, certificadoAtivo.senha_iv, certificadoAtivo.senha_auth_tag);
    const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, senhaStr);

    let privateKeyPem = '', certPem = '';
    for (const safeContents of p12.safeContents) {
      for (const safeBag of safeContents.safeBags) {
        if (safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag && safeBag.key) privateKeyPem = forge.pki.privateKeyToPem(safeBag.key);
        else if (safeBag.type === forge.pki.oids.certBag && safeBag.cert) certPem = forge.pki.certificateToPem(safeBag.cert);
      }
    }
    if (!privateKeyPem || !certPem) throw new Error('Falha ao extrair chaves do certificado');

    const { serieRec, numeroGerado } = await NFeService.obterProximoNumeroSerie(tenant_id, estabelecimento_id, cenario.modelo, 1);

    const dataEmissao = new Date();
    const itensCalculados = [];
    let valorTotalProdutos = 0;

    const cNF = Math.floor(Math.random() * 99999999).toString();
    const chaveAcesso = gerarChaveAcesso(
      (estabelecimento.codigo_municipio_ibge || empresa.codigo_municipio_ibge || '1302603').substring(0, 2),
      dataEmissao, estabelecimento.cnpj, cenario.modelo, serieRec.serie.toString(),
      numeroGerado.toString(), '1', cNF
    );

    let numeroItem = 1;
    for (const item of itens) {
      const calcResult = await calcularImpostosItem({
        tenant_id,
        produto_id: item.produto_id,
        empresa_id: estabelecimento.empresa_id,
        uf_origem: empresa.uf,
        uf_destino: destinatario.uf,
        tipo_cliente: destinatario.tipo_contribuinte,
        finalidade: 3,
        cfop: cenario.cfop_padrao || item.cfop,
        ncm: item.ncm,
        cst_csosn_informado: item.icms_cst_csosn,
        valor_produto: item.valor_unitario,
        quantidade: item.quantidade,
        desconto: 0, frete: 0, seguro: 0, outros: 0
      });

      if (calcResult.status === 'PENDENTE_TRIBUTACAO') {
        return res.status(422).json({ error: 'Tributação pendente para um ou mais produtos.', pendencias: calcResult.pendencias });
      }

      const vTotal = Number((Number(item.valor_unitario) * Number(item.quantidade)).toFixed(2));
      valorTotalProdutos += vTotal;

      itensCalculados.push({
        tenant_id,
        numero_item: numeroItem++,
        produto_id: item.produto_id,
        codigo_produto: item.codigo_produto || String(item.produto_id),
        descricao_produto: item.descricao_produto || 'Ajuste Fiscal',
        cfop: calcResult.cfop,
        ncm: item.ncm || '00000000',
        cest: item.cest,
        origem: item.origem || 0,
        quantidade: item.quantidade,
        valor_unitario: item.valor_unitario,
        valor_total: vTotal,
        valor_desconto: 0, valor_frete: 0, valor_seguro: 0, valor_outras: 0,
        icms_cst_csosn: calcResult.tributacao.icms.status === 'CALCULADO' ? calcResult.tributacao.icms.cst_csosn : '',
        icms_base: calcResult.tributacao.icms.status === 'CALCULADO' ? calcResult.tributacao.icms.base : 0,
        icms_aliquota: calcResult.tributacao.icms.status === 'CALCULADO' ? calcResult.tributacao.icms.aliquota : 0,
        icms_valor: calcResult.tributacao.icms.status === 'CALCULADO' ? calcResult.tributacao.icms.valor : 0,
        icms_st_base: calcResult.tributacao.icms_st.status === 'CALCULADO' ? calcResult.tributacao.icms_st.base : 0,
        icms_st_aliquota: calcResult.tributacao.icms_st.status === 'CALCULADO' ? calcResult.tributacao.icms_st.aliquota : 0,
        icms_st_valor: calcResult.tributacao.icms_st.status === 'CALCULADO' ? calcResult.tributacao.icms_st.valor : 0,
        ipi_cst: calcResult.tributacao.ipi.status === 'CALCULADO' ? calcResult.tributacao.ipi.cst : '',
        ipi_base: calcResult.tributacao.ipi.status === 'CALCULADO' ? calcResult.tributacao.ipi.base : 0,
        ipi_aliquota: calcResult.tributacao.ipi.status === 'CALCULADO' ? calcResult.tributacao.ipi.aliquota : 0,
        ipi_valor: calcResult.tributacao.ipi.status === 'CALCULADO' ? calcResult.tributacao.ipi.valor : 0,
        pis_cst: calcResult.tributacao.pis.status === 'CALCULADO' ? calcResult.tributacao.pis.cst : '',
        pis_base: calcResult.tributacao.pis.status === 'CALCULADO' ? calcResult.tributacao.pis.base : 0,
        pis_aliquota: calcResult.tributacao.pis.status === 'CALCULADO' ? calcResult.tributacao.pis.aliquota : 0,
        pis_valor: calcResult.tributacao.pis.status === 'CALCULADO' ? calcResult.tributacao.pis.valor : 0,
        cofins_cst: calcResult.tributacao.cofins.status === 'CALCULADO' ? calcResult.tributacao.cofins.cst : '',
        cofins_base: calcResult.tributacao.cofins.status === 'CALCULADO' ? calcResult.tributacao.cofins.base : 0,
        cofins_aliquota: calcResult.tributacao.cofins.status === 'CALCULADO' ? calcResult.tributacao.cofins.aliquota : 0,
        cofins_valor: calcResult.tributacao.cofins.status === 'CALCULADO' ? calcResult.tributacao.cofins.valor : 0,
        ibs_cst: calcResult.tributacao.ibs.status === 'CALCULADO' ? calcResult.tributacao.ibs.cst : '',
        ibs_base: calcResult.tributacao.ibs.status === 'CALCULADO' ? calcResult.tributacao.ibs.base : 0,
        ibs_aliquota: calcResult.tributacao.ibs.status === 'CALCULADO' ? calcResult.tributacao.ibs.aliquota : 0,
        ibs_valor: calcResult.tributacao.ibs.status === 'CALCULADO' ? calcResult.tributacao.ibs.valor : 0,
        cbs_cst: calcResult.tributacao.cbs.status === 'CALCULADO' ? calcResult.tributacao.cbs.cst : '',
        cbs_base: calcResult.tributacao.cbs.status === 'CALCULADO' ? calcResult.tributacao.cbs.base : 0,
        cbs_aliquota: calcResult.tributacao.cbs.status === 'CALCULADO' ? calcResult.tributacao.cbs.aliquota : 0,
        cbs_valor: calcResult.tributacao.cbs.status === 'CALCULADO' ? calcResult.tributacao.cbs.valor : 0,
        cClassTrib: calcResult.tributacao.ibs?.cClassTrib,
        item_original_id: item.item_original_id
      });
    }

    const notaFiscal = await prisma.fiscal_notas.create({
      data: {
        tenant_id, estabelecimento_id, cenario_id, destinatario_id: notaOriginal.destinatario_id,
        serie_id: serieRec.id, modelo: cenario.modelo, numero: numeroGerado, chave_acesso: chaveAcesso,
        ambiente: 2, tipo: notaOriginal.tipo, finalidade: 3,
        natureza_operacao: cenario.operacao, data_emissao: dataEmissao, status: 'PROCESSANDO',
        valor_total_produtos: valorTotalProdutos,
        valor_frete: 0, valor_seguro: 0, valor_desconto: 0, valor_outras: 0,
        valor_total_nota: valorTotalProdutos,
        itens: { create: itensCalculados },
        referenciados: {
          create: {
            tenant_id,
            chave_acesso: notaOriginal.chave_acesso,
            tipo_referencia: 'AJUSTE'
          }
        }
      },
      include: { referenciados: true }
    });

    const xmlBruto = montarXmlNFe({ ...notaFiscal, serie: serieRec.serie }, empresa, estabelecimento, destinatario, itensCalculados, notaFiscal.referenciados);
    const xmlAssinado = assinarXml(xmlBruto, privateKeyPem, certPem, `NFe${notaFiscal.chave_acesso}`, 'infNFe');

    await prisma.fiscal_notas.update({
      where: { id: notaFiscal.id },
      data: { xml_gerado: xmlBruto, xml_assinado: xmlAssinado }
    });

    const cleanXml = xmlAssinado.replace(/^<\?xml[^>]+>\s*/i, '');
    const uf = estabelecimento.uf || empresa.uf;
    const wsdlUrl = getSefazUrl(uf, 2, 'NFeAutorizacao');
    const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4"><enviNFe versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe"><idLote>1</idLote><indSinc>1</indSinc>${cleanXml}</enviNFe></nfeDadosMsg></soap12:Body></soap12:Envelope>`;

    try {
      await enviarSefaz(soapEnvelope, wsdlUrl, pfxBuffer, senhaStr);
      await prisma.fiscal_notas.update({
        where: { id: notaFiscal.id },
        data: { status: 'AUTORIZADA', codigo_status_sefaz: '100', motivo_status_sefaz: 'Autorizado o uso da NF-e', xml_autorizado: xmlAssinado }
      });
      return res.json({ message: 'Nota de Ajuste Emitida', numero: numeroGerado, status: 'AUTORIZADA', id: notaFiscal.id });
    } catch (e) {
      await prisma.fiscal_notas.update({
        where: { id: notaFiscal.id },
        data: { status: 'REJEITADA', codigo_status_sefaz: null, motivo_status_sefaz: 'Falha no envio (mTLS/Rede): ' + e.message }
      });
      return res.status(422).json({ error: 'Rejeitada pela Sefaz', motivo: e.message, numero: numeroGerado });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

notasRouter.get('/:id/eventos', async (req, res) => {
  try {
    const eventos = await prisma.fiscal_eventos.findMany({
      where: { nota_id: req.params.id },
      orderBy: { data_evento: 'asc' }
    });
    return res.json(eventos);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

notasRouter.get('/:id/pdf', async (req, res) => {
  try {
    const nota = await prisma.fiscal_notas.findUnique({ where: { id: req.params.id } });
    const xml = nota?.xml_autorizado || nota?.xml_assinado || nota?.xml_gerado;
    if (!nota || !xml) {
      return res.status(404).send('XML não encontrado para esta nota.');
    }

    const { DANFe, DANFCe } = spedPdf.default || spedPdf;

    let pdfBuffer;
    if (nota.modelo === '65') {
      pdfBuffer = await DANFCe({ xml });
    } else {
      pdfBuffer = await DANFe({ xml });
    }

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="DANFE_${nota.chave_acesso || nota.numero}.pdf"`
    });

    return res.send(Buffer.from(pdfBuffer));
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    return res.status(500).send('Erro ao gerar PDF: ' + error.message);
  }
});

notasRouter.get('/:id/xml', async (req, res) => {
  try {
    const nota = await prisma.fiscal_notas.findUnique({ where: { id: req.params.id } });
    const xml = nota?.xml_autorizado || nota?.xml_assinado || nota?.xml_gerado;
    if (!nota || !xml) {
      return res.status(404).send('XML não encontrado para esta nota.');
    }

    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="NFe_${nota.chave_acesso || nota.numero}.xml"`
    });

    return res.send(xml);
  } catch (error) {
    return res.status(500).send('Erro ao baixar XML: ' + error.message);
  }
});

notasRouter.post('/:id/corrigir-impostos', async (req, res) => {
  try {
    const { itens } = req.body;
    for (const item of itens) {
      const cst = item.ibs_cst || '000';
      const cClass = (item.cClassTrib && item.cClassTrib !== 'null' && item.cClassTrib !== 'undefined' && /^\d{6}$/.test(String(item.cClassTrib).trim()))
        ? String(item.cClassTrib).trim()
        : (cst === '410' ? '410001' : '000001');

      await prisma.fiscal_nota_itens.update({
        where: { id: item.id },
        data: {
          icms_cst_csosn: item.icms_cst_csosn,
          ncm: item.ncm,
          cfop: item.cfop,
          icms_aliquota: item.icms_aliquota !== undefined ? Number(item.icms_aliquota) : undefined,
          pis_cst: item.pis_cst,
          cofins_cst: item.cofins_cst,
          ibs_cst: cst,
          cbs_cst: cst,
          cClassTrib: cClass
        }
      });
    }
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

notasRouter.post('/:id/reenviar', async (req, res) => {
  try {
    const result = await NFeService.reenviar(req.params.id);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

notasRouter.post('/:id/cancelar', async (req, res) => {
  try {
    const { justificativa } = req.body;
    const nota = await prisma.fiscal_notas.findUnique({ where: { id: req.params.id } });

    if (!nota || !nota.chave_acesso || !nota.protocolo_autorizacao) {
      return res.status(400).json({ error: 'Nota inválida para cancelamento (sem chave ou protocolo).' });
    }

    const result = await NFeEventosService.processarEvento(
      nota.tenant_id,
      nota.id,
      'CANCELAMENTO',
      {
        chave_acesso: nota.chave_acesso,
        protocolo_autorizacao: nota.protocolo_autorizacao,
        justificativa
      }
    );

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

notasRouter.post('/:id/cce', async (req, res) => {
  try {
    const { justificativa, sequencial } = req.body;
    const nota = await prisma.fiscal_notas.findUnique({ where: { id: req.params.id } });

    if (!nota || !nota.chave_acesso) {
      return res.status(400).json({ error: 'Nota inválida para CC-e.' });
    }

    const totalCces = await prisma.fiscal_eventos.count({ where: { nota_id: nota.id, tipo: 'CC_E' } });
    const seq = sequencial || (totalCces + 1);

    const result = await NFeEventosService.processarEvento(
      nota.tenant_id,
      nota.id,
      'CC_E',
      {
        chave_acesso: nota.chave_acesso,
        sequencial: seq,
        justificativa
      }
    );

    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});
