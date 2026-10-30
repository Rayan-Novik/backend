import { Router } from 'express';
import multer from 'multer';
import forge from 'node-forge';
import prisma from '../../../config/prisma.js';
import { encrypt } from '../shared/encryption.js';
import { getTenantId } from '../shared/tenantHelper.js';

export const certificadosRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

function parsePfxBuffer(pfxBuffer, senha) {
  const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, senha);

  let validade_inicio = new Date();
  let validade_fim = new Date();
  validade_fim.setFullYear(validade_fim.getFullYear() + 1);
  let titular = 'Titular Extraído do PFX';

  const bags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certBag = bags[forge.pki.oids.certBag]?.[0];
  if (certBag && certBag.cert) {
    validade_inicio = certBag.cert.validity.notBefore;
    validade_fim = certBag.cert.validity.notAfter;
    const attrs = certBag.cert.subject.attributes;
    const cn = attrs.find((a) => a.shortName === 'CN');
    if (cn) titular = cn.value;
  }

  return { validade_inicio, validade_fim, titular };
}

certificadosRouter.post('/upload', upload.single('certificado'), async (req, res) => {
  try {
    const tenant_id = getTenantId(req);
    const { estabelecimento_id, senha } = req.body;
    const file = req.file;

    if (!estabelecimento_id || !senha || !file) {
      return res.status(400).json({ error: 'Parâmetros obrigatórios: estabelecimento_id, senha e arquivo certificado' });
    }

    let certMeta;
    try {
      certMeta = parsePfxBuffer(file.buffer, senha);
    } catch (e) {
      return res.status(400).json({ error: 'Senha incorreta ou certificado inválido' });
    }

    const certificado_base64 = file.buffer.toString('base64');
    const certEnc = encrypt(certificado_base64);
    const passEnc = encrypt(senha);

    const record = await prisma.$transaction(async (tx) => {
      await tx.fiscal_certificados.updateMany({
        where: { tenant_id, estabelecimento_id, ativo: true },
        data: { ativo: false }
      });

      return await tx.fiscal_certificados.create({
        data: {
          tenant_id,
          estabelecimento_id,
          certificado_base64: certEnc.encryptedData,
          certificado_iv: certEnc.iv,
          certificado_auth_tag: certEnc.authTag,
          senha_criptografada: passEnc.encryptedData,
          senha_iv: passEnc.iv,
          senha_auth_tag: passEnc.authTag,
          validade_inicio: certMeta.validade_inicio,
          validade_fim: certMeta.validade_fim,
          titular: certMeta.titular,
          tipo: 'A1',
          ativo: true
        }
      });
    });

    return res.status(201).json({
      id: record.id,
      titular: record.titular,
      validade_inicio: record.validade_inicio,
      validade_fim: record.validade_fim,
      estabelecimento_id: record.estabelecimento_id
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

certificadosRouter.get('/', async (req, res) => {
  try {
    const { estabelecimento_id } = req.query;
    const tenant_id = getTenantId(req);

    const certificados = await prisma.fiscal_certificados.findMany({
      where: {
        tenant_id: String(tenant_id),
        ...(estabelecimento_id ? { estabelecimento_id: String(estabelecimento_id) } : {})
      },
      select: {
        id: true,
        tenant_id: true,
        estabelecimento_id: true,
        validade_inicio: true,
        validade_fim: true,
        titular: true,
        tipo: true,
        ativo: true,
        created_at: true
      },
      orderBy: { created_at: 'desc' }
    });
    return res.json(certificados);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

certificadosRouter.post('/', async (req, res) => {
  try {
    const tenant_id = getTenantId(req);
    const { estabelecimento_id, senha, arquivo_pfx_base64 } = req.body;

    if (!estabelecimento_id || !senha || !arquivo_pfx_base64) {
      return res.status(400).json({ error: 'Faltam campos: estabelecimento_id, senha, arquivo_pfx_base64' });
    }

    const pfxBuffer = Buffer.from(arquivo_pfx_base64, 'base64');
    let certMeta;
    try {
      certMeta = parsePfxBuffer(pfxBuffer, senha);
    } catch (e) {
      return res.status(400).json({ error: 'Senha incorreta ou certificado inválido' });
    }

    const certEnc = encrypt(arquivo_pfx_base64);
    const passEnc = encrypt(senha);

    const record = await prisma.$transaction(async (tx) => {
      await tx.fiscal_certificados.updateMany({
        where: { tenant_id, estabelecimento_id, ativo: true },
        data: { ativo: false }
      });

      return await tx.fiscal_certificados.create({
        data: {
          tenant_id,
          estabelecimento_id,
          certificado_base64: certEnc.encryptedData,
          certificado_iv: certEnc.iv,
          certificado_auth_tag: certEnc.authTag,
          senha_criptografada: passEnc.encryptedData,
          senha_iv: passEnc.iv,
          senha_auth_tag: passEnc.authTag,
          validade_inicio: certMeta.validade_inicio,
          validade_fim: certMeta.validade_fim,
          titular: certMeta.titular,
          tipo: 'A1',
          ativo: true
        }
      });
    });

    return res.status(201).json({ id: record.id, titular: record.titular });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

certificadosRouter.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { senha, arquivo_pfx_base64 } = req.body;

    if (!senha || !arquivo_pfx_base64) return res.status(400).json({ error: 'Envie senha e arquivo_pfx_base64' });

    const pfxBuffer = Buffer.from(arquivo_pfx_base64, 'base64');
    let certMeta;
    try {
      certMeta = parsePfxBuffer(pfxBuffer, senha);
    } catch (e) {
      return res.status(400).json({ error: 'Senha incorreta ou certificado inválido' });
    }

    const certEnc = encrypt(arquivo_pfx_base64);
    const passEnc = encrypt(senha);

    const record = await prisma.fiscal_certificados.update({
      where: { id },
      data: {
        certificado_base64: certEnc.encryptedData,
        certificado_iv: certEnc.iv,
        certificado_auth_tag: certEnc.authTag,
        senha_criptografada: passEnc.encryptedData,
        senha_iv: passEnc.iv,
        senha_auth_tag: passEnc.authTag,
        validade_inicio: certMeta.validade_inicio,
        validade_fim: certMeta.validade_fim,
        titular: certMeta.titular,
        ativo: true
      }
    });

    return res.json({ id: record.id, atualizado: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

certificadosRouter.delete('/:id', async (req, res) => {
  try {
    await prisma.fiscal_certificados.delete({ where: { id: req.params.id } });
    return res.status(204).send();
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});
