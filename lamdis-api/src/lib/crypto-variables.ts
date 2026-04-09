import crypto from 'crypto';

const KEY_HEX = process.env.VARIABLES_SECRET_KEY || '';
let key: Buffer | null = null;
if (KEY_HEX) {
  if (KEY_HEX.length !== 64) {
    console.warn('VARIABLES_SECRET_KEY should be 32 bytes hex (64 chars)');
  }
  try { key = Buffer.from(KEY_HEX, 'hex'); } catch {}
}

function requireKey() {
  if (!key) throw new Error('VARIABLES_SECRET_KEY not configured');
  return key as Buffer;
}

export function encryptValue(plain: string) {
  const k = requireKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', k, iv);
  const enc = Buffer.concat([cipher.update(Buffer.from(plain, 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: enc.toString('base64'), iv: iv.toString('base64'), tag: tag.toString('base64') };
}

export function decryptValue(ciphertext: string, iv: string, tag: string) {
  const k = requireKey();
  const ivBuf = Buffer.from(iv, 'base64');
  const tagBuf = Buffer.from(tag, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', k, ivBuf);
  decipher.setAuthTag(tagBuf);
  const dec = Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]);
  return dec.toString('utf8');
}
