import crypto from 'crypto';
import { env } from './env.js';

const ALGO = 'aes-256-gcm';

export function encrypt(plain: any): { iv: string; tag: string; data: string } | any {
  if (!env.ENC_SECRET) return plain;
  const iv = crypto.randomBytes(12);
  const key = crypto.createHash('sha256').update(env.ENC_SECRET).digest();
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const json = Buffer.from(JSON.stringify(plain));
  const enc = Buffer.concat([cipher.update(json), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: iv.toString('base64'), tag: tag.toString('base64'), data: enc.toString('base64') };
}

export function decrypt(obj: any): any {
  if (!env.ENC_SECRET) return obj;
  if (!obj || typeof obj !== 'object' || !obj.iv || !obj.tag || !obj.data) return obj;
  const key = crypto.createHash('sha256').update(env.ENC_SECRET).digest();
  const iv = Buffer.from(obj.iv, 'base64');
  const tag = Buffer.from(obj.tag, 'base64');
  const enc = Buffer.from(obj.data, 'base64');
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]).toString();
  return JSON.parse(dec);
}
