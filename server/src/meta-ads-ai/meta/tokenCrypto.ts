import crypto from 'crypto';
import { metaConfig } from '../config';

const ALGO = 'aes-256-gcm';

function getKey() {
  if (!metaConfig.tokenEncryptionKey) {
    throw new Error('META_TOKEN_ENCRYPTION_KEY is required');
  }
  return crypto.createHash('sha256').update(metaConfig.tokenEncryptionKey).digest();
}

export function encryptToken(token: string) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptToken(payload: string) {
  const raw = Buffer.from(payload, 'base64');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

