import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const env = (k: string): string | undefined => (import.meta.env as any)[k] ?? process.env[k];

export const COOKIE = 'lodge_admin';
const TTL_S = 60 * 60 * 8;

const sha = (s: string) => createHash('sha256').update(s).digest();
const sign = (payload: string) => createHmac('sha256', env('SESSION_SECRET') ?? '').update(payload).digest('hex');

export const adminConfigured = (): boolean => Boolean(env('ADMIN_PASSWORD') && (env('SESSION_SECRET') ?? '').length >= 16);

export function checkPassword(input: string): boolean {
  const expected = env('ADMIN_PASSWORD');
  if (!expected) return false;
  return timingSafeEqual(sha(input), sha(expected));
}

export function makeToken(): string {
  const exp = Math.floor(Date.now() / 1000) + TTL_S;
  return `${exp}.${sign(String(exp))}`;
}

export function isAdmin(cookieValue: string | undefined): boolean {
  if (!adminConfigured() || !cookieValue) return false;
  const [exp, mac] = cookieValue.split('.');
  if (!exp || !mac || Number(exp) < Date.now() / 1000) return false;
  const good = Buffer.from(sign(exp));
  const got = Buffer.from(mac);
  return good.length === got.length && timingSafeEqual(good, got);
}

export const cookieOptions = (secure: boolean) => ({
  httpOnly: true,
  secure,
  sameSite: 'strict' as const,
  path: '/',
  maxAge: TTL_S,
});

// Limitation basique des tentatives (par instance serveur).
const attempts = new Map<string, { n: number; at: number }>();
export function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || now - a.at > 15 * 60_000) { attempts.set(key, { n: 1, at: now }); return false; }
  a.n++;
  return a.n > 8;
}

// Refuse les requêtes d'écriture venant d'un autre site (protection CSRF en plus de SameSite=Strict).
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  // Derrière le proxy de Vercel, l'URL interne peut différer de l'adresse publique : on compare aussi les en-têtes d'hôte.
  const hosts = [request.headers.get('x-forwarded-host'), request.headers.get('host'), new URL(request.url).host]
    .filter(Boolean)
    .flatMap((h) => String(h).split(',').map((x) => x.trim()));
  try { return hosts.includes(new URL(origin).host); } catch { return false; }
}
