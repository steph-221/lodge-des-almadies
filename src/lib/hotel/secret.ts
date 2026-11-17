import { createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';

// Codes du personnel : HMAC avec poivre, puis scrypt salé. Format : scrypt$N$sel$hachage (base64).
const N = 16384;
const KEYLEN = 32;

const pre = (secret: string, pepper: string) => createHmac('sha256', pepper).update(secret).digest('hex');
const derive = (input: string, salt: Buffer, n: number) =>
  new Promise<Buffer>((resolve, reject) => scrypt(input, salt, KEYLEN, { N: n, r: 8, p: 1 }, (e, k) => (e ? reject(e) : resolve(k))));

export async function hashSecret(secret: string, pepper: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(pre(secret, pepper), salt, N);
  return `scrypt$${N}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifySecret(secret: string, stored: string, pepper: string): Promise<boolean> {
  const [kind, n, salt, hash] = (stored || '').split('$');
  const cost = Number(n);
  if (kind !== 'scrypt' || !salt || !hash || !Number.isInteger(cost) || cost < 1024 || cost > 1 << 20) return false;
  try {
    const expected = Buffer.from(hash, 'base64');
    const got = await derive(pre(secret, pepper), Buffer.from(salt, 'base64'), cost);
    return got.length === expected.length && timingSafeEqual(got, expected);
  } catch {
    return false;
  }
}

export const generatePin = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0');

const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const generatePassword = (length = 16): string => Array.from({ length }, () => ALPHABET[randomInt(0, ALPHABET.length)]).join('');
