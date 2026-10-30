import { Router } from 'express';
import forge from 'node-forge';
import prisma from '../../../config/prisma.js';
import { assinarXml } from './nfe-signer.js';
import { enviarSefaz } from './sefaz-client.js';
import { decrypt } from '../shared/encryption.js';
import { montarXmlEvento, montarXmlInutilizacao } from './eventos-builder.js';
import { getSefazUrl } from './sefaz-urls.js';
import { fiscalEvents } from '../shared/events.js';
import { getTenantId } from '../shared/tenantHelper.js';

export const eventosRouter = Router();

async function getSefazCredentials(estabelecimento_id) {
  const certificadoAtivo = await prisma.fiscal_certificados.findFirst({
    where: { estabelecimento_id, ativo: true }
  });
  if (!certificadoAtivo) throw new Error('Nenhum certificado ativo encontrado para assinar o evento');

  const pfxBase64String = decrypt(certificadoAtivo.certificado_base64, certificadoAtivo.certificado_iv, certificadoAtivo.certificado_auth_tag);
  const pfxBuffer = Buffer.from(pfxBase64String, 'base64');
  const senhaStr = decrypt(certificadoAtivo.senha_criptografada, certificadoAtivo.senha_iv, certificadoAtivo.senha_auth_tag);

  const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, senhaStr);

  let privateKeyPem = '', certPem = '';
  for (const safeContents of p12.safeContents) {
    for (const safeBag of safeContents.safeBags) {
      if (safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag && safeBag.key) {
        privateKeyPem = forge.pki.privateKeyToPem(safeBag.key);
      } else if (safeBag.type === forge.pki.oids.certBag && safeBag.cert) {
        certPem = forge.pki.certificateToPem(safeBag.cert);
      }
    }
  }
  return { pfxBuffer, senhaStr, privateKeyPem, certPem };
}

async function transmitirEvento(xmlAssinado, url, wsdlNs, creds) {
  const cleanXml = xmlAssinado.replace(/^<\?xml[^>]+>\s*/i, '');
  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="${wsdlNs}">${cleanXml}</nfeDadosMsg></soap12:Body></soap12:Envelope>`;

  try {
    const sefazRet = await enviarSefaz(soapEnvelope, url, creds.pfxBuffer, creds.senhaStr);
    return { ok: true, cStat: '135', xMotivo: 'Evento registrado e vinculado a NF-e', ret: sefazRet };
  } catch (e) {
    return { ok: false, cStat: null, xMotivo: 'Falha no envio (mTLS/Rede): ' + e.message };
  }
}

eventosRouter.post('/cancelamento', async (req, res) => {
  try {
    const tenant_id = getTenantId(req);
    const { nota_id, justificativa } = req.body;
    if (!nota_id || !justificativa || justificativa.length < 15) {
      return res.status(400).json({ error: 'Nota e Justificativa (min 15 chars) são obrigatórios' });
    }

    const nota = await prisma.fiscal_notas.findFirst({
      where: { id: nota_id, tenant_id }
    });

    if (!nota) return res.status(404).json({ error: 'Nota não encontrada' });
    if (nota.status !== 'AUTORIZADA') return res.status(400).json({ error: 'Apenas notas autorizadas podem ser canceladas' });

    const eventoPrevio = await prisma.fiscal_eventos.findFirst({
      where: { nota_id, tipo: 'CANCELAMENTO' }
    });
    if (eventoPrevio) return res.status(400).json({ error: 'Nota já possui evento de cancelamento' });

    const estabelecimento = await prisma.fiscal_estabelecimentos.findUnique({ where: { id: nota.estabelecimento_id }, include: { empresa: true } });
    if (!estabelecimento) throw new Error('Estabelecimento não encontrado');

    const creds = await getSefazCredentials(nota.estabelecimento_id);
    const xml = montarXmlEvento(nota, estabelecimento.cnpj, '110111', 'Cancelamento', 1, justificativa);
    const idEvento = xml.match(/Id="(ID.*?)"/)?.[1] || '';
    const assinado = assinarXml(xml, creds.privateKeyPem, creds.certPem, idEvento, 'infEvento');

    const uf = estabelecimento.uf || estabelecimento.empresa.uf;
    const url = getSefazUrl(uf, nota.ambiente, 'RecepcaoEvento');
    const s = await transmitirEvento(assinado, url, 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4', creds);

    await prisma.fiscal_eventos.create({
      data: {
        tenant_id,
        nota_id,
        tipo: 'CANCELAMENTO',
        payload_xml_envio: assinado,
        justificativa,
        codigo_status_sefaz: s.cStat,
        motivo_status_sefaz: s.xMotivo
      }
    });

    if (s.ok) {
      await prisma.fiscal_notas.update({ where: { id: nota.id }, data: { status: 'CANCELADA' } });
      fiscalEvents.emit('onNotaCancelada', { nota_id: nota.id, tenant_id, chave_acesso: nota.chave_acesso });
      res.json({ message: 'Cancelamento registrado', sefaz: s });
    } else {
      res.status(422).json({ error: 'Falha no envio à SEFAZ. Evento salvo como pendente/falho.', sefaz: s });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

eventosRouter.post('/cce', async (req, res) => {
  try {
    const tenant_id = getTenantId(req);
    const { nota_id, justificativa } = req.body;
    if (!nota_id || !justificativa || justificativa.length < 15) {
      return res.status(400).json({ error: 'Nota e Justificativa (min 15 chars) são obrigatórios' });
    }

    const nota = await prisma.fiscal_notas.findFirst({ where: { id: nota_id, tenant_id } });
    if (!nota) return res.status(404).json({ error: 'Nota não encontrada' });
    if (nota.status !== 'AUTORIZADA') return res.status(400).json({ error: 'Nota não está autorizada' });

    const totalCces = await prisma.fiscal_eventos.count({ where: { nota_id, tipo: 'CC_E' } });
    const sequencial = totalCces + 1;

    const estabelecimento = await prisma.fiscal_estabelecimentos.findUnique({ where: { id: nota.estabelecimento_id }, include: { empresa: true } });
    if (!estabelecimento) throw new Error('Estabelecimento não encontrado');

    const creds = await getSefazCredentials(nota.estabelecimento_id);
    const xml = montarXmlEvento(nota, estabelecimento.cnpj, '110110', 'Carta de Correcao', sequencial, justificativa);
    const idEvento = xml.match(/Id="(ID.*?)"/)?.[1] || '';
    const assinado = assinarXml(xml, creds.privateKeyPem, creds.certPem, idEvento, 'infEvento');

    const uf = estabelecimento.uf || estabelecimento.empresa.uf;
    const url = getSefazUrl(uf, nota.ambiente, 'RecepcaoEvento');
    const s = await transmitirEvento(assinado, url, 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4', creds);

    await prisma.fiscal_eventos.create({
      data: {
        tenant_id, nota_id, tipo: 'CC_E', sequencial, justificativa, payload_xml_envio: assinado,
        codigo_status_sefaz: s.cStat, motivo_status_sefaz: s.xMotivo
      }
    });

    if (s.ok) res.json({ message: 'CC-e registrada', sefaz: s });
    else res.status(422).json({ error: 'Falha no envio à SEFAZ. CC-e salva como pendente/falha.', sefaz: s });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

eventosRouter.post('/inutilizacao', async (req, res) => {
  try {
    const tenant_id = getTenantId(req);
    const { estabelecimento_id, serie_id, numero_inicial, numero_final, justificativa } = req.body;
    if (!estabelecimento_id || !serie_id || numero_inicial == null || numero_final == null || justificativa?.length < 15) {
      return res.status(400).json({ error: 'Parâmetros insuficientes' });
    }

    const notasEmitidasNoIntervalo = await prisma.fiscal_notas.findFirst({
      where: { tenant_id, estabelecimento_id, serie_id, numero: { gte: Number(numero_inicial), lte: Number(numero_final) } }
    });
    if (notasEmitidasNoIntervalo) return res.status(400).json({ error: 'Conflito de Numeração: Existe nota já emitida neste intervalo.' });

    const estabelecimento = await prisma.fiscal_estabelecimentos.findUnique({ where: { id: estabelecimento_id }, include: { empresa: true } });
    if (!estabelecimento) throw new Error('Estabelecimento não encontrado');

    const serie = await prisma.fiscal_series.findFirst({ where: { id: serie_id } });
    if (!serie) throw new Error('Série não encontrada');

    const creds = await getSefazCredentials(estabelecimento_id);
    const xml = montarXmlInutilizacao(estabelecimento, serie.serie, Number(numero_inicial), Number(numero_final), justificativa);
    const idInut = xml.match(/Id="(ID.*?)"/)?.[1] || '';
    const assinado = assinarXml(xml, creds.privateKeyPem, creds.certPem, idInut, 'infInut');

    const uf = estabelecimento.uf || estabelecimento.empresa.uf;
    const ambiente = 2;
    const url = getSefazUrl(uf, ambiente, 'NfeInutilizacao');
    const s = await transmitirEvento(assinado, url, 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeInutilizacao4', creds);

    await prisma.fiscal_inutilizacoes.create({
      data: {
        tenant_id,
        estabelecimento_id,
        serie_id,
        numero_inicial: Number(numero_inicial),
        numero_final: Number(numero_final),
        justificativa,
        status: s.ok ? 'AUTORIZADA' : 'REJEITADA',
        codigo_status_sefaz: s.cStat,
        motivo_status_sefaz: s.xMotivo
      }
    });

    if (s.ok) res.json({ message: 'Inutilização registrada', sefaz: s });
    else res.status(422).json({ error: 'Falha no envio à SEFAZ. Inutilização pendente/falha.', sefaz: s });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

eventosRouter.post('/manifestacao', async (req, res) => {
  try {
    const tenant_id = getTenantId(req);
    const { nota_id, tipo } = req.body;
    if (!nota_id || !tipo) return res.status(400).json({ error: 'Parâmetros insuficientes' });

    const nota = await prisma.fiscal_notas.findFirst({ where: { id: nota_id, tenant_id } });
    if (!nota) return res.status(404).json({ error: 'Nota não encontrada' });

    const estabelecimento = await prisma.fiscal_estabelecimentos.findUnique({ where: { id: nota.estabelecimento_id }, include: { empresa: true } });
    if (!estabelecimento) throw new Error('Estabelecimento não encontrado');

    const manifestacoesAnteriores = await prisma.fiscal_eventos.findMany({
      where: { nota_id, tipo: { in: ['CIENCIA', 'CONFIRMACAO', 'DESCONHECIMENTO', 'OPERACAO_NAO_REALIZADA'] } },
      orderBy: { data_evento: 'asc' }
    });

    const manifestacaoFinal = manifestacoesAnteriores.find(m => m.tipo !== 'CIENCIA');
    if (manifestacaoFinal) {
      return res.status(400).json({ error: `Operação rejeitada: A nota já possui uma manifestação conclusiva (${manifestacaoFinal.tipo}).` });
    }

    const mapCodigos = {
      'CONFIRMACAO': { cod: '210200', desc: 'Confirmacao da Operacao' },
      'CIENCIA': { cod: '210210', desc: 'Ciencia da Operacao' },
      'DESCONHECIMENTO': { cod: '210220', desc: 'Desconhecimento da Operacao' },
      'OPERACAO_NAO_REALIZADA': { cod: '210240', desc: 'Operacao nao Realizada' }
    };
    const evConf = mapCodigos[tipo];
    if (!evConf) return res.status(400).json({ error: 'Tipo de manifestação inválido' });

    const sequencial = 1;
    const creds = await getSefazCredentials(nota.estabelecimento_id);
    const xml = montarXmlEvento(nota, estabelecimento.cnpj, evConf.cod, evConf.desc, sequencial, '');
    const idEvento = xml.match(/Id="(ID.*?)"/)?.[1] || '';
    const assinado = assinarXml(xml, creds.privateKeyPem, creds.certPem, idEvento, 'infEvento');

    const uf = estabelecimento.uf || estabelecimento.empresa.uf;
    const url = getSefazUrl(uf, nota.ambiente, 'RecepcaoEvento');
    const s = await transmitirEvento(assinado, url, 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4', creds);

    await prisma.fiscal_eventos.create({
      data: {
        tenant_id, nota_id, tipo, sequencial, payload_xml_envio: assinado,
        codigo_status_sefaz: s.cStat, motivo_status_sefaz: s.xMotivo
      }
    });

    if (s.ok) res.json({ message: 'Manifestação registrada', sefaz: s });
    else res.status(422).json({ error: 'Falha no envio à SEFAZ. Manifestação pendente/falha.', sefaz: s });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
