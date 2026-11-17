import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './env';
import { isRole, type Role } from './hotel/permissions';

export const COOKIE = 'lodge_admin';
const TTL_S = 60 * 60 * 8;

const sha = (s: string) => createHash('sha256').update(s).digest();
const sign = (payload: string) => createHmac('sha256', env('SESSION_SECRET') ?? '').update(payload).digest('hex');

// L'accès de secours exige un mot de passe d'au moins 16 caractères.
export const adminConfigured = (): boolean => (env('ADMIN_PASSWORD') ?? '').length >= 16 && (env('SESSION_SECRET') ?? '').length >= 16;

// Accès de secours de la direction : mot de passe unique ADMIN_PASSWORD (indépendant de la base de données).
export function checkPassword(input: string): boolean {
  const expected = env('ADMIN_PASSWORD');
  if (!expected) return false;
  return timingSafeEqual(sha(input), sha(expected));
}

export type SessionClaims = { staffId: number; role: Role; sv: number; exp: number };

// Jeton v2 : v2.exp.staffId.role.sv.mac. staffId 0 = accès de secours. Le rôle du jeton n'est qu'un indice :
// pour l'espace hôtel, le middleware relit le compte en base à chaque requête (révocation immédiate).
export function makeToken(c: { staffId: number; role: Role; sv: number }, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + TTL_S;
  const payload = `v2.${exp}.${c.staffId}.${c.role}.${c.sv}`;
  return `${payload}.${sign(payload)}`;
}

export function readToken(cookieValue: string | undefined, now = Date.now()): SessionClaims | null {
  if (!cookieValue || (env('SESSION_SECRET') ?? '').length < 16) return null;
  const parts = cookieValue.split('.');
  if (parts.length !== 6 || parts[0] !== 'v2') return null;
  const [, exp, staffId, role, sv, mac] = parts;
  if (!/^\d+$/.test(exp) || !/^\d+$/.test(staffId) || !/^\d+$/.test(sv) || !isRole(role)) return null;
  if (Number(exp) < now / 1000) return null;
  const good = Buffer.from(sign(`v2.${exp}.${staffId}.${role}.${sv}`));
  const got = Buffer.from(mac);
  if (good.length !== got.length || !timingSafeEqual(good, got)) return null;
  return { staffId: Number(staffId), role, sv: Number(sv), exp: Number(exp) };
}

// La session peut être émise dès que SESSION_SECRET est défini ; ADMIN_PASSWORD ne sert qu'à l'accès de secours.
export const sessionConfigured = (): boolean => (env('SESSION_SECRET') ?? '').length >= 16;

// Vrai pour un jeton valide de la direction (garde supplémentaire des routes de la zone Site ;
// le middleware relit en plus le compte en base).
export function isAdmin(cookieValue: string | undefined): boolean {
  return readToken(cookieValue)?.role === 'direction';
}

export const cookieOptions = (secure: boolean) => ({
  httpOnly: true,
  secure,
  // Lax : un lien ouvert depuis un e-mail (brief du matin) arrive connecté ; les écritures restent protégées par sameOrigin().
  sameSite: 'lax' as const,
  path: '/',
  maxAge: TTL_S,
});

// Limitation basique des tentatives (par instance serveur) ; la limitation durable par compte est en base (hotel/throttle.ts).
const attempts = new Map<string, { n: number; at: number }>();
export function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const a = attempts.get(key);
  if (!a || now - a.at > 15 * 60_000) { attempts.set(key, { n: 1, at: now }); return false; }
  a.n++;
  return a.n > 8;
}

// Refuse les requêtes d'écriture venant d'un autre site (protection CSRF en plus de SameSite).
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  // Derrière le proxy de Vercel, l'URL interne peut différer de l'adresse publique : on compare aussi les en-têtes d'hôte.
  const hosts = [request.headers.get('x-forwarded-host'), request.headers.get('host'), new URL(request.url).host]
    .filter(Boolean)
    .flatMap((h) => String(h).split(',').map((x) => x.trim()));
  try { return hosts.includes(new URL(origin).host); } catch { return false; }
}
