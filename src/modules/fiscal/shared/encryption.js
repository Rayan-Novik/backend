import crypto from 'crypto';

const DEFAULT_LEGACY_KEY = '12345678901234567890123456789012';
const ALGORITHM = 'aes-256-gcm';

function getKeyBuffer(rawKey) {
  const keyStr = rawKey || process.env.FISCAL_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || DEFAULT_LEGACY_KEY;
  const buf = Buffer.from(String(keyStr), 'utf8');
  if (buf.length === 32) return buf;
  if (buf.length > 32) return buf.subarray(0, 32);
  const padded = Buffer.alloc(32, '0');
  buf.copy(padded);
  return padded;
}

export function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const key = getKeyBuffer();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encryptedData = cipher.update(String(text), 'utf8', 'hex');
  encryptedData += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    encryptedData,
    iv: iv.toString('hex'),
    authTag
  };
}

export function decrypt(encryptedData, ivHex, authTagHex) {
  const tryDecrypt = (keyBuf) => {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuf, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  };

  try {
    return tryDecrypt(getKeyBuffer());
  } catch (err) {
    // Fallback para chave legada do ModuloFiscal caso o certificado tenha sido migrado
    return tryDecrypt(getKeyBuffer(DEFAULT_LEGACY_KEY));
  }
}
