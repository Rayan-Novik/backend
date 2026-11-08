import prisma from '../../../config/prisma.js';
import { calcularImpostosItem } from '../regras-tributarias/calcular.js';
import { NFePhpAdapter } from '../adapters/NFePhpAdapter.js';
import { getTrueDate } from '../shared/time-sync.js';
import { decrypt } from '../shared/encryption.js';
import { resolveFiscalProduct } from './ProductSyncService.js';
import { fiscalEvents } from '../shared/events.js';

export class NFeService {
  static async obterProximoNumeroSerie(tenant_id, estabelecimento_id, modelo, serieNumero = 1, serieId = null) {
    let serieRec = null;

    if (serieId) {
      serieRec = await prisma.fiscal_series.findUnique({
        where: { id: String(serieId) },
        include: { numeracoes: true }
      });
    }

    if (!serieRec) {
      serieRec = await prisma.fiscal_series.findUnique({
        where: {
          estabelecimento_id_modelo_serie: {
            estabelecimento_id,
            modelo: String(modelo),
            serie: Number(serieNumero)
          }
        },
        include: { numeracoes: true }
      });
    }

    if (!serieRec) {
      serieRec = await prisma.$transaction(async (tx) => {
        const novaSerie = await tx.fiscal_series.create({
          data: {
            tenant_id: String(tenant_id),
            estabelecimento_id,
            modelo: String(modelo),
            serie: Number(serieNumero),
            ativo: true
          }
        });
        const num = await tx.fiscal_numeracoes.create({
          data: {
            tenant_id: String(tenant_id),
            serie_id: novaSerie.id,
            ultimo_numero: 0
          }
        });
        return { ...novaSerie, numeracoes: num };
      });
    } else if (!serieRec.numeracoes) {
      await prisma.fiscal_numeracoes.create({
        data: {
          tenant_id: String(tenant_id),
          serie_id: serieRec.id,
          ultimo_numero: 0
        }
      });
    }

    const updated = await prisma.fiscal_numeracoes.update({
      where: { serie_id: serieRec.id },
      data: { ultimo_numero: { increment: 1 } }
    });

    return { serieRec, numeroGerado: updated.ultimo_numero };
  }

  static async reenviar(nota_id) {
    const nota = await prisma.fiscal_notas.findUnique({
      where: { id: nota_id },
      include: { itens: true }
    });
    if (!nota) throw new Error('Nota não encontrada');

    // Se a nota não tiver itens em fiscal_nota_itens, tenta reconstruir automaticamente a partir do pedido vinculado
    if (!nota.itens || nota.itens.length === 0) {
      if (nota.id_pedido) {
        const pItens = await prisma.pedido_items.findMany({
          where: { id_pedido: nota.id_pedido }
        });

        if (pItens.length > 0) {
          const prodIds = pItens.map(p => p.id_produto).filter(Boolean);
          const prodsDb = await prisma.produtos.findMany({
            where: { id_produto: { in: prodIds } }
          });

          const novosItens = [];
          for (let i = 0; i < pItens.length; i++) {
            const pi = pItens[i];
            const pDb = prodsDb.find(p => p.id_produto === pi.id_produto);
            const qtd = Number(pi.quantidade || 1);
            const vUnit = Number(pi.preco || 0);
            const vTot = Number((qtd * vUnit).toFixed(2));
            const ncmRaw = String(pDb?.ncm || pi.ncm || '19021900').replace(/\D/g, '');
            const ncm = ncmRaw.length >= 8 ? ncmRaw.substring(0, 8) : '19021900';
            const cest = pDb?.cest || pi.cest || null;
            const origem = parseInt(pDb?.origem || '0', 10) || 0;

            const itemCriado = await prisma.fiscal_nota_itens.create({
              data: {
                tenant_id: String(nota.tenant_id),
                nota_id: nota.id,
                numero_item: i + 1,
                produto_id: String(pi.id_produto || i + 1),
                codigo_produto: String(pi.id_produto || i + 1),
                descricao_produto: pi.nome || pDb?.nome || 'Item sem descricao',
                cfop: '5102',
                ncm: ncm,
                cest: cest,
                origem: origem,
                quantidade: qtd,
                valor_unitario: vUnit,
                valor_total: vTot,
                valor_desconto: 0,
                valor_frete: 0,
                valor_seguro: 0,
                valor_outras: 0,
                icms_cst_csosn: '102',
                icms_base: 0,
                icms_aliquota: 0,
                icms_valor: 0,
                pis_cst: '49',
                pis_base: 0,
                pis_aliquota: 0,
                pis_valor: 0,
                cofins_cst: '49',
                cofins_base: 0,
                cofins_aliquota: 0,
                cofins_valor: 0,
                ibs_cst: '049',
                cClassTrib: '000001',
                cbs_cst: '049'
              }
            });
            novosItens.push(itemCriado);
          }
          nota.itens = novosItens;
        }
      }
    }

    if (!nota.itens || nota.itens.length === 0) {
      throw new Error('A nota fiscal não possui itens cadastrados para emissão. Adicione pelo menos um produto à nota antes de reenviar.');
    }

    let estabelecimento = await prisma.fiscal_estabelecimentos.findUnique({
      where: { id: nota.estabelecimento_id },
      include: { certificados: { where: { ativo: true }, take: 1 } }
    });
    if (!estabelecimento || !estabelecimento.certificados || estabelecimento.certificados.length === 0) {
      const estabComCert = await prisma.fiscal_estabelecimentos.findFirst({
        where: { tenant_id: nota.tenant_id, certificados: { some: { ativo: true } } },
        include: { certificados: { where: { ativo: true }, take: 1 } }
      });
      if (estabComCert) estabelecimento = estabComCert;
    }
    if (!estabelecimento) throw new Error('Estabelecimento não encontrado');
    const empresa = await prisma.fiscal_empresas.findUnique({ where: { id: estabelecimento.empresa_id } });
    const destinatario = nota.destinatario_id
      ? await prisma.fiscal_destinatarios.findUnique({ where: { id: nota.destinatario_id } })
      : null;
    const cenario = await prisma.fiscal_cenarios_fiscais.findUnique({ where: { id: nota.cenario_id } });
    const serieRec = await prisma.fiscal_series.findUnique({ where: { id: nota.serie_id } });

    if (!empresa || !cenario || !serieRec) throw new Error('Dados relacionados faltando');
    if (!destinatario && cenario.modelo !== '65') throw new Error('Destinatário obrigatório para NF-e Modelo 55');

    const trueDate = await getTrueDate();
    const diffMinutos = (trueDate.getTime() - nota.data_emissao.getTime()) / 60000;
    if (String(cenario.modelo) === '65' || diffMinutos > 5 || diffMinutos < -1) {
      nota.data_emissao = trueDate;
      await prisma.fiscal_notas.update({ where: { id: nota.id }, data: { data_emissao: nota.data_emissao } });
    }

    const cert = estabelecimento.certificados[0];
    if (!cert) throw new Error('Certificado digital não configurado');

    const pfxBase64String = decrypt(cert.certificado_base64, cert.certificado_iv, cert.certificado_auth_tag);
    const pfxBuffer = Buffer.from(pfxBase64String, 'base64');
    const pfxBase64 = pfxBuffer.toString('base64');
    const senhaStr = decrypt(cert.senha_criptografada, cert.senha_iv, cert.senha_auth_tag);

    let emitCNPJ = String(estabelecimento.cnpj || '').replace(/\D/g, '');
    emitCNPJ = emitCNPJ.padStart(14, '0').substring(0, 14);

    const configNFePHP = {
      atualizacao: nota.data_emissao.toISOString(),
      tpAmb: nota.ambiente,
      razaosocial: empresa.razao_social,
      siglaUF: estabelecimento.uf || empresa.uf,
      cnpj: emitCNPJ,
      schemes: 'PL_010_V1.30',
      versao: '4.00',
      tokenIBPT: '',
      CSC: estabelecimento.csc || '',
      CSCid: estabelecimento.id_token_csc || ''
    };

    const itensCalculados = nota.itens.map(it => ({
      numero_item: it.numero_item,
      quantidade: Number(it.quantidade),
      valor_unitario: Number(it.valor_unitario),
      valor_total: Number(it.valor_total),
      cfop: it.cfop,
      produto: {
        id: it.produto_id,
        codigo_interno: it.codigo_produto,
        descricao: it.descricao_produto,
        ncm: it.ncm,
        cest: it.cest,
        origem: it.origem,
        ean_gtin: null
      },
      tributacao: {
        icms: { cst_csosn: it.icms_cst_csosn, base: Number(it.icms_base), aliquota: Number(it.icms_aliquota), valor: Number(it.icms_valor) },
        icms_st: { base: Number(it.icms_st_base), aliquota: Number(it.icms_st_aliquota), valor: Number(it.icms_st_valor) },
        ipi: { cst: it.ipi_cst, base: Number(it.ipi_base), aliquota: Number(it.ipi_aliquota), valor: Number(it.ipi_valor) },
        pis: { cst: it.pis_cst, base: Number(it.pis_base), aliquota: Number(it.pis_aliquota), valor: Number(it.pis_valor) },
        cofins: { cst: it.cofins_cst, base: Number(it.cofins_base), aliquota: Number(it.cofins_aliquota), valor: Number(it.cofins_valor) },
        ibs: {
          cst: it.ibs_cst,
          cClassTrib: (it.cClassTrib && it.cClassTrib !== 'null' && it.cClassTrib !== 'undefined' && /^\d{6}$/.test(String(it.cClassTrib).trim()))
            ? String(it.cClassTrib).trim()
            : (it.ibs_cst === '410' ? '410001' : '000001'),
          base: Number(it.ibs_base),
          aliquota: Number(it.ibs_aliquota),
          valor: Number(it.ibs_valor)
        },
        cbs: {
          cst: it.cbs_cst,
          cClassTrib: (it.cClassTrib && it.cClassTrib !== 'null' && it.cClassTrib !== 'undefined' && /^\d{6}$/.test(String(it.cClassTrib).trim()))
            ? String(it.cClassTrib).trim()
            : (it.cbs_cst === '410' ? '410001' : '000001'),
          base: Number(it.cbs_base),
          aliquota: Number(it.cbs_aliquota),
          valor: Number(it.cbs_valor)
        }
      }
    }));

    const produtoIds = itensCalculados.map(i => i.produto.id);
    const produtosReais = await prisma.fiscal_produtos.findMany({ where: { id: { in: produtoIds } } });
    itensCalculados.forEach(it => {
      const pr = produtosReais.find(p => p.id === it.produto.id);
      if (pr) it.produto.ean_gtin = pr.ean_gtin;
    });

    let codigoPagamentoSefaz = '01';
    if (nota.forma_pagamento_id) {
      const forma = await prisma.fiscal_formas_pagamento.findUnique({ where: { id: nota.forma_pagamento_id } });
      if (forma) codigoPagamentoSefaz = forma.codigo_sefaz;
    }

    const payload = {
      empresa: { ...empresa },
      estabelecimento: { ...estabelecimento },
      destinatario: destinatario ? { ...destinatario } : {},
      cenario: { ...cenario },
      numero: nota.numero,
      serie: serieRec.serie,
      data_emissao: nota.data_emissao.toISOString(),
      itens: itensCalculados,
      totais: {
        bruto: Number(nota.valor_total_produtos),
        frete: Number(nota.valor_frete || 0),
        total: Number(nota.valor_total_nota)
      },
      pagamento_codigo: codigoPagamentoSefaz,
      password: senhaStr
    };

    const resPHP = await NFePhpAdapter.callAdapter('emitir', payload, configNFePHP, pfxBase64);
    if (resPHP.status === 'error') throw new Error(`Erro no SPED-NFE: ${resPHP.message}`);

    const infProt = resPHP.sefaz_response?.protNFe?.infProt || resPHP.sefaz_response?.retEnviNFe?.protNFe?.infProt;
    const statusSefaz = infProt?.cStat || resPHP.sefaz_response?.cStat || null;
    const motivoSefaz = infProt?.xMotivo || resPHP.sefaz_response?.xMotivo || resPHP.message || 'Erro Sefaz';
    const protocolo = infProt?.nProt || null;

    let finalStatus = 'PROCESSANDO';
    if (resPHP.is_draft) {
      finalStatus = 'RASCUNHO';
    } else if (resPHP.status === 'success') {
      if (statusSefaz == '100') finalStatus = 'AUTORIZADA';
      else finalStatus = 'REJEITADA';
    } else {
      finalStatus = 'ERRO';
    }

    const chaveFinal = resPHP.chave_acesso || infProt?.chNFe || nota.chave_acesso || null;

    await prisma.fiscal_notas.update({
      where: { id: nota.id },
      data: {
        xml_gerado: resPHP.xml_gerado || null,
        xml_assinado: resPHP.xml_assinado || null,
        xml_autorizado: finalStatus === 'AUTORIZADA' ? resPHP.xml_assinado : null,
        chave_acesso: chaveFinal,
        protocolo_autorizacao: protocolo,
        codigo_status_sefaz: statusSefaz ? String(statusSefaz) : null,
        motivo_status_sefaz: motivoSefaz,
        status: finalStatus
      }
    });

    if (finalStatus === 'AUTORIZADA') {
      fiscalEvents.emit('onNotaAutorizada', {
        nota_id: nota.id,
        tenant_id: nota.tenant_id,
        chave_acesso: chaveFinal,
        movimenta_estoque: cenario.movimenta_estoque,
        gera_financeiro: cenario.gera_financeiro,
        itens: itensCalculados
      });
    }

    return {
      id: nota.id,
      nota_id: nota.id,
      success: finalStatus === 'AUTORIZADA',
      status: finalStatus,
      motivo: motivoSefaz,
      chave_acesso: chaveFinal
    };
  }

  static async emitir(tenant_id, estabelecimento_id, cenario_id, destinatario_id, itens_req, extras = {}) {
    if (tenant_id && typeof tenant_id === 'object') {
      const opts = tenant_id;
      tenant_id = opts.tenant_id;
      estabelecimento_id = opts.estabelecimento_id;
      cenario_id = opts.cenario_id;
      destinatario_id = opts.destinatario_id;
      itens_req = opts.itens || opts.itens_req;
      extras = opts;
    }
    const tenantStr = String(tenant_id);

    // 1. Carregar Estabelecimento e Empresa (Prioriza dinamicamente quem possui Certificado Digital Ativo)
    let estabelecimento = null;
    if (estabelecimento_id) {
      estabelecimento = await prisma.fiscal_estabelecimentos.findUnique({
        where: { id: estabelecimento_id },
        include: { empresa: true, certificados: { where: { ativo: true } } }
      });
      if (estabelecimento && (!estabelecimento.certificados || estabelecimento.certificados.length === 0)) {
        const estabComCert = await prisma.fiscal_estabelecimentos.findFirst({
          where: { tenant_id: tenantStr, certificados: { some: { ativo: true } } },
          include: { empresa: true, certificados: { where: { ativo: true } } }
        });
        if (estabComCert) {
          estabelecimento = estabComCert;
        }
      }
    }
    if (!estabelecimento) {
      estabelecimento = await prisma.fiscal_estabelecimentos.findFirst({
        where: { tenant_id: tenantStr, certificados: { some: { ativo: true } } },
        include: { empresa: true, certificados: { where: { ativo: true } } }
      });
    }
    if (!estabelecimento) {
      estabelecimento = await prisma.fiscal_estabelecimentos.findFirst({
        where: { tenant_id: tenantStr },
        include: { empresa: true, certificados: { where: { ativo: true } } }
      });
    }
    if (!estabelecimento) throw new Error('Estabelecimento emissor não encontrado. Configure os dados fiscais da empresa primeiro.');
    const empresa = estabelecimento.empresa;

    // 2. Carregar Cenário Fiscal
    let cenario = null;
    if (cenario_id) {
      cenario = await prisma.fiscal_cenarios_fiscais.findUnique({ where: { id: cenario_id } });
    }
    if (!cenario) {
      const modeloDesejado = extras.modelo || '55';
      cenario = await prisma.fiscal_cenarios_fiscais.findFirst({
        where: { tenant_id: tenantStr, modelo: String(modeloDesejado) }
      });
    }
    if (!cenario) throw new Error('Cenário fiscal não encontrado');

    // 3. Carregar Destinatário (opcional para NFC-e 65, suporta id_usuario do www e cpf_cnpj_nota avulso do PDV)
    let destinatario = null;
    const ufOrigem = estabelecimento.uf || empresa.uf || 'PA';

    if (destinatario_id) {
      destinatario = await prisma.fiscal_destinatarios.findUnique({ where: { id: String(destinatario_id) } });

      if (!destinatario && /^\d+$/.test(String(destinatario_id))) {
        const usuarioWww = await prisma.usuarios.findUnique({
          where: { id_usuario: Number(destinatario_id) },
          include: { enderecos: { take: 1 } }
        });
        if (usuarioWww) {
          let docUsuario = extras.cpf_cnpj_nota ? String(extras.cpf_cnpj_nota).replace(/\D/g, '') : '';
          if (!docUsuario && usuarioWww.cpf_criptografado) {
            try {
              const { decrypt: decryptWww } = await import('../../../services/cryptoService.js');
              docUsuario = String(decryptWww(usuarioWww.cpf_criptografado) || '').replace(/\D/g, '');
            } catch (_) {}
          }
          const end = usuarioWww.enderecos?.[0];
          if (docUsuario) {
            let destDb = await prisma.fiscal_destinatarios.findFirst({
              where: { tenant_id: tenantStr, cpf_cnpj: docUsuario }
            });
            if (!destDb) {
              destDb = await prisma.fiscal_destinatarios.create({
                data: {
                  tenant_id: tenantStr,
                  cpf_cnpj: docUsuario,
                  razao_social: usuarioWww.nome_completo || 'Consumidor Final',
                  tipo_contribuinte: 'NAO_CONTRIBUINTE',
                  logradouro: end?.rua || 'Nao Informado',
                  numero: end?.numero || 'S/N',
                  bairro: end?.bairro || 'Centro',
                  cep: end?.cep ? String(end.cep).replace(/\D/g, '') : '66000000',
                  municipio: end?.cidade || estabelecimento.municipio || 'Belem',
                  uf: end?.estado || ufOrigem,
                  codigo_municipio_ibge: estabelecimento.codigo_municipio_ibge || '1501402'
                }
              });
            }
            destinatario = destDb;
          } else if (cenario.modelo === '65') {
            destinatario = null;
          }
        }
      }

      if (!destinatario && cenario.modelo !== '65') {
        throw new Error('Destinatário não encontrado ou sem CPF/CNPJ válido para NF-e (Modelo 55)');
      }
    } else if (extras.cpf_cnpj_nota) {
      const docAvulso = String(extras.cpf_cnpj_nota).replace(/\D/g, '');
      if (docAvulso.length === 11 || docAvulso.length === 14) {
        destinatario = {
          cpf_cnpj: docAvulso,
          razao_social: extras.nome_nota || 'CONSUMIDOR FINAL',
          tipo_contribuinte: 'NAO_CONTRIBUINTE',
          uf: ufOrigem
        };
      }
    } else if (cenario.modelo !== '65') {
      throw new Error('Destinatário é obrigatório para NF-e (Modelo 55)');
    }

    // 4. Carregar Certificado Ativo (com busca e fallback dinâmico pelo tenant)
    let certificadoAtivo = estabelecimento.certificados?.[0];
    if (!certificadoAtivo) {
      certificadoAtivo = await prisma.fiscal_certificados.findFirst({
        where: { estabelecimento_id: estabelecimento.id, ativo: true }
      });
    }
    if (!certificadoAtivo) {
      certificadoAtivo = await prisma.fiscal_certificados.findFirst({
        where: { tenant_id: tenantStr, ativo: true },
        include: { estabelecimento: { include: { empresa: true } } }
      });
      if (certificadoAtivo?.estabelecimento) {
        estabelecimento = certificadoAtivo.estabelecimento;
      }
    }
    if (!certificadoAtivo) throw new Error('Nenhum certificado digital ativo encontrado para este estabelecimento.');

    const pfxBase64String = decrypt(certificadoAtivo.certificado_base64, certificadoAtivo.certificado_iv, certificadoAtivo.certificado_auth_tag);
    const pfxBuffer = Buffer.from(pfxBase64String, 'base64');
    const senhaStr = decrypt(certificadoAtivo.senha_criptografada, certificadoAtivo.senha_iv, certificadoAtivo.senha_auth_tag);
    const pfxBase64 = pfxBuffer.toString('base64');

    // 5. Numeração Atômica no MySQL
    const serieAlvo = Number(extras.serie || extras.serie_numero || 1);
    const serieIdAlvo = extras.serie_id || null;

    const { serieRec, numeroGerado } = await NFeService.obterProximoNumeroSerie(
      tenantStr,
      estabelecimento.id,
      cenario.modelo,
      serieAlvo,
      serieIdAlvo
    );

    // 6. Calcular Impostos de cada item
    const dataEmissao = await getTrueDate();
    const itensCalculados = [];
    let valorTotalProdutos = 0;
    let valorTotalFrete = 0;
    let valorTotalDesconto = 0;

    const ufDestino = destinatario?.uf || ufOrigem;
    const tipoCliente = destinatario?.tipo_contribuinte || 'NAO_CONTRIBUINTE';

    for (let i = 0; i < itens_req.length; i++) {
      const it = itens_req[i];
      const produto = await resolveFiscalProduct(tenantStr, it.produto_id);
      if (!produto) throw new Error(`Produto não encontrado no cadastro fiscal: ${it.produto_id}`);

      const ncmValido = (!produto.ncm || produto.ncm === '00000000') ? '21069090' : produto.ncm;
      produto.ncm = ncmValido;

      const calcResult = await calcularImpostosItem({
        tenant_id: tenantStr,
        produto_id: produto.id,
        empresa_id: estabelecimento.empresa_id,
        uf_origem: ufOrigem,
        uf_destino: ufDestino,
        tipo_cliente: tipoCliente,
        finalidade: cenario.finalidade,
        cfop: cenario.cfop_padrao,
        ncm: ncmValido,
        quantidade: it.valor_total_complementar ? 1 : Number(it.quantidade),
        valor_produto: Number(it.valor_total_complementar || it.valor_unitario),
        desconto: Number(it.valor_desconto || 0),
        frete: Number(it.valor_frete || 0),
        seguro: 0,
        outros: 0
      });

      if (calcResult.status === 'PENDENTE_TRIBUTACAO') {
        throw new Error(`Tributação pendente para o produto "${produto.descricao}": ${calcResult.pendencias?.join(', ')}`);
      }

      const vProdItem = it.valor_total_complementar
        ? Number(it.valor_total_complementar)
        : Number((Number(it.valor_unitario) * Number(it.quantidade)).toFixed(2));
      valorTotalProdutos += vProdItem;
      valorTotalFrete += Number(it.valor_frete || 0);
      valorTotalDesconto += Number(it.valor_desconto || 0);

      itensCalculados.push({
        numero_item: i + 1,
        produto: { ...produto },
        quantidade: Number(it.quantidade),
        valor_unitario: Number(it.valor_unitario),
        valor_total: vProdItem,
        valor_frete: Number(it.valor_frete || 0),
        valor_desconto: Number(it.valor_desconto || 0),
        tributacao: calcResult.tributacao,
        cfop: calcResult.cfop
      });
    }

    // 7. Salvar Nota Fiscal no Banco (PROCESSANDO)
    const notaFiscal = await prisma.fiscal_notas.create({
      data: {
        tenant_id: tenantStr,
        id_pedido: extras.id_pedido ? Number(extras.id_pedido) : null,
        estabelecimento_id: estabelecimento.id,
        cenario_id: cenario.id,
        destinatario_id: destinatario?.id || null,
        modelo: cenario.modelo,
        serie_id: serieRec.id,
        numero: numeroGerado,
        ambiente: Number(extras.ambiente || 2),
        tipo: 1,
        forma_pagamento_id: extras.forma_pagamento_id || null,
        finalidade: cenario.finalidade,
        natureza_operacao: cenario.operacao,
        data_emissao: dataEmissao,
        status: 'PROCESSANDO',
        valor_total_produtos: valorTotalProdutos,
        valor_frete: valorTotalFrete,
        valor_seguro: 0,
        valor_desconto: valorTotalDesconto,
        valor_outras: 0,
        valor_total_nota: Math.max(0, valorTotalProdutos + valorTotalFrete - valorTotalDesconto),
        itens: {
          create: itensCalculados.map(it => ({
            tenant_id: tenantStr,
            numero_item: it.numero_item,
            produto_id: it.produto.id,
            codigo_produto: it.produto.codigo_interno,
            descricao_produto: it.produto.descricao,
            cfop: it.cfop,
            ncm: it.produto.ncm,
            cest: it.produto.cest,
            origem: it.produto.origem,
            quantidade: it.quantidade,
            valor_unitario: it.valor_unitario,
            valor_total: it.valor_total,
            valor_desconto: 0,
            valor_frete: it.valor_frete || 0,
            valor_seguro: 0,
            valor_outras: 0,
            icms_cst_csosn: it.tributacao.icms?.cst_csosn || '',
            icms_base: it.tributacao.icms?.base || 0,
            icms_aliquota: it.tributacao.icms?.aliquota || 0,
            icms_valor: it.tributacao.icms?.valor || 0,
            icms_st_base: it.tributacao.icms_st?.base || 0,
            icms_st_aliquota: it.tributacao.icms_st?.aliquota || 0,
            icms_st_valor: it.tributacao.icms_st?.valor || 0,
            ipi_cst: it.tributacao.ipi?.cst || '',
            ipi_base: it.tributacao.ipi?.base || 0,
            ipi_aliquota: it.tributacao.ipi?.aliquota || 0,
            ipi_valor: it.tributacao.ipi?.valor || 0,
            pis_cst: it.tributacao.pis?.cst || '',
            pis_base: it.tributacao.pis?.base || 0,
            pis_aliquota: it.tributacao.pis?.aliquota || 0,
            pis_valor: it.tributacao.pis?.valor || 0,
            cofins_cst: it.tributacao.cofins?.cst || '',
            cofins_base: it.tributacao.cofins?.base || 0,
            cofins_aliquota: it.tributacao.cofins?.aliquota || 0,
            cofins_valor: it.tributacao.cofins?.valor || 0,
            ibs_cst: it.tributacao.ibs?.cst || '',
            ibs_base: it.tributacao.ibs?.base || 0,
            ibs_aliquota: it.tributacao.ibs?.aliquota || 0,
            ibs_valor: it.tributacao.ibs?.valor || 0,
            cbs_cst: it.tributacao.cbs?.cst || '',
            cbs_base: it.tributacao.cbs?.base || 0,
            cbs_aliquota: it.tributacao.cbs?.aliquota || 0,
            cbs_valor: it.tributacao.cbs?.valor || 0,
            cClassTrib: (it.tributacao.ibs?.cClassTrib && it.tributacao.ibs?.cClassTrib !== 'null' && it.tributacao.ibs?.cClassTrib !== 'undefined' && /^\d{6}$/.test(String(it.tributacao.ibs.cClassTrib).trim()))
              ? String(it.tributacao.ibs.cClassTrib).trim()
              : (it.tributacao.ibs?.cst === '410' ? '410001' : '000001')
          }))
        }
      }
    });

    // 8. Preparar Payload para o PHP Adapter
    let emitCNPJ = String(estabelecimento.cnpj || '').replace(/\D/g, '');
    emitCNPJ = emitCNPJ.padStart(14, '0').substring(0, 14);

    const configNFePHP = {
      atualizacao: dataEmissao.toISOString(),
      tpAmb: Number(extras.ambiente || 2),
      razaosocial: empresa.razao_social,
      siglaUF: ufOrigem,
      cnpj: emitCNPJ,
      schemes: 'PL_010_V1.30',
      versao: '4.00',
      tokenIBPT: '',
      CSC: estabelecimento.csc || '',
      CSCid: estabelecimento.id_token_csc || ''
    };

    let codigoPagamentoSefaz = '01';
    if (extras.forma_pagamento_id) {
      const forma = await prisma.fiscal_formas_pagamento.findUnique({ where: { id: extras.forma_pagamento_id } });
      if (forma) codigoPagamentoSefaz = forma.codigo_sefaz;
    }

    const payload = {
      empresa: { ...empresa },
      estabelecimento: { ...estabelecimento },
      destinatario: destinatario ? { ...destinatario } : {},
      cenario: { ...cenario },
      numero: numeroGerado,
      serie: serieRec.serie,
      data_emissao: dataEmissao.toISOString(),
      itens: itensCalculados,
      totais: { bruto: valorTotalProdutos, frete: valorTotalFrete, total: valorTotalProdutos + valorTotalFrete },
      modalidade_frete: extras.modalidade_frete ?? 9,
      referenciados: extras.referenciados || [],
      apenas_salvar: extras.apenas_salvar || false,
      contingencia: extras.contingencia || false,
      pagamento_codigo: codigoPagamentoSefaz,
      password: senhaStr
    };

    const resPHP = await NFePhpAdapter.callAdapter('emitir', payload, configNFePHP, pfxBase64);

    if (resPHP.status === 'error') {
      await prisma.fiscal_notas.update({
        where: { id: notaFiscal.id },
        data: { status: 'ERRO', motivo_status_sefaz: resPHP.message }
      });
      throw new Error(`Erro no SPED-NFE: ${resPHP.message}`);
    }

    const infProt = resPHP.sefaz_response?.protNFe?.infProt || resPHP.sefaz_response?.retEnviNFe?.protNFe?.infProt;
    const statusSefaz = infProt?.cStat || resPHP.sefaz_response?.cStat || null;
    const motivoSefaz = infProt?.xMotivo || resPHP.sefaz_response?.xMotivo || resPHP.message || 'Erro Sefaz';
    const protocolo = infProt?.nProt || null;

    let finalStatus = 'PROCESSANDO';
    if (resPHP.is_draft) {
      finalStatus = extras.contingencia ? 'CONTINGENCIA' : 'RASCUNHO';
    } else if (resPHP.status === 'success') {
      if (statusSefaz == '100') {
        finalStatus = 'AUTORIZADA';
      } else {
        finalStatus = 'REJEITADA';
      }
    } else {
      finalStatus = 'ERRO';
    }

    const chaveFinal = resPHP.chave_acesso || infProt?.chNFe || notaFiscal.chave_acesso || null;

    await prisma.fiscal_notas.update({
      where: { id: notaFiscal.id },
      data: {
        xml_gerado: resPHP.xml_gerado || null,
        xml_assinado: resPHP.xml_assinado || null,
        xml_autorizado: finalStatus === 'AUTORIZADA' ? resPHP.xml_assinado : null,
        status: finalStatus,
        codigo_status_sefaz: statusSefaz ? String(statusSefaz) : null,
        motivo_status_sefaz: motivoSefaz,
        protocolo_autorizacao: protocolo,
        data_autorizacao: protocolo ? await getTrueDate() : null,
        chave_acesso: chaveFinal
      }
    });

    if (extras.id_pedido) {
      try {
        const idPed = Number(extras.id_pedido);
        const tipoStr = String(cenario.modelo) === '65' ? 'NFCE' : 'NFE';
        const valorTotalNota = Math.max(0, valorTotalProdutos + valorTotalFrete - valorTotalDesconto);
        await prisma.notas_fiscais.upsert({
          where: { id_pedido: idPed },
          update: {
            tipo_nota: tipoStr,
            numero_nota: numeroGerado,
            serie: serieRec.serie,
            chave_acesso: chaveFinal || undefined,
            status: finalStatus,
            motivo_status: String(motivoSefaz || '').substring(0, 250),
            xml_gerado: resPHP.xml_assinado || resPHP.xml_gerado || null,
            protocolo_sefaz: protocolo || null,
            valor_produtos: valorTotalProdutos,
            valor_frete: valorTotalFrete,
            valor_desconto: valorTotalDesconto,
            valor_total: valorTotalNota
          },
          create: {
            id_tenant: Number(tenantStr) || 1,
            id_pedido: idPed,
            tipo_operacao: 'SAIDA',
            tipo_nota: tipoStr,
            numero_nota: numeroGerado,
            serie: serieRec.serie,
            chave_acesso: chaveFinal || null,
            status: finalStatus,
            motivo_status: String(motivoSefaz || '').substring(0, 250),
            xml_gerado: resPHP.xml_assinado || resPHP.xml_gerado || null,
            protocolo_sefaz: protocolo || null,
            valor_produtos: valorTotalProdutos,
            valor_frete: valorTotalFrete,
            valor_desconto: valorTotalDesconto,
            valor_total: valorTotalNota
          }
        });
      } catch (syncErr) {
        console.warn('⚠️ Aviso ao sincronizar notas_fiscais do pedido:', syncErr.message);
      }
    }

    if (finalStatus === 'AUTORIZADA') {
      fiscalEvents.emit('onNotaAutorizada', {
        nota_id: notaFiscal.id,
        tenant_id: tenantStr,
        chave_acesso: chaveFinal,
        movimenta_estoque: cenario.movimenta_estoque,
        gera_financeiro: cenario.gera_financeiro,
        itens: itensCalculados
      });
    }

    return {
      id: notaFiscal.id,
      nota_id: notaFiscal.id,
      modelo: cenario.modelo,
      success: finalStatus === 'AUTORIZADA',
      numero: numeroGerado,
      serie: serieRec.serie,
      status: finalStatus,
      sefaz_response: resPHP.sefaz_response,
      motivo: motivoSefaz,
      chave_acesso: chaveFinal
    };
  }
}
