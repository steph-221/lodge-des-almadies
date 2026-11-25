import type { APIRoute } from 'astro';
import { COOKIE, checkPassword, cookieOptions, makeToken, adminConfigured, sessionConfigured, sameOrigin, tooManyAttempts } from '../../../lib/auth';
import { dbConfigured } from '../../../lib/db';
import { json, readJson } from '../../../lib/http';
import { audit, ipHash } from '../../../lib/hotel/audit';
import { findByLogin, pepper, touchLogin } from '../../../lib/hotel/staff';
import { hashSecret, verifySecret } from '../../../lib/hotel/secret';
import { attempt, clearFails, limitsFor, purgeStale } from '../../../lib/hotel/throttle';

export const prerender = false;

// Hachage factice : une identité inconnue coûte le même temps qu'un mauvais code (pas de fuite sur les comptes).
let dummy: Promise<string> | null = null;
const dummyHash = () => (dummy ??= hashSecret('inconnu', pepper()).catch((e) => { dummy = null; throw e; }));

const BAD = 'Identifiant ou code incorrect.';
const LOCKED = 'Trop de tentatives. Réessayez dans 15 minutes.';

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  if (!sameOrigin(request)) return json(403, { error: 'forbidden' });
  if (!sessionConfigured()) return json(503, { error: 'not_configured' });
  let ip = 'x';
  try { ip = clientAddress ?? 'x'; } catch { /* adresse indisponible */ }

  const body = await readJson(request);
  const password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
  const login = typeof body.login === 'string' ? body.login.trim().toLowerCase().slice(0, 40) : '';
  const secure = new URL(request.url).protocol === 'https:';
  const ipKey = `ip:${ipHash(ip) ?? 'x'}`;

  try {
    // Accès de secours de la direction : mot de passe seul. Limitation durable en base dès qu'elle est disponible.
    if (!login) {
      if (!adminConfigured()) return json(401, { error: BAD });
      if (dbConfigured()) {
        const a = await attempt(limitsFor('backup', ipKey));
        if (a.locked) return json(429, { error: LOCKED });
      } else if (tooManyAttempts(ip)) return json(429, { error: LOCKED });
      if (!checkPassword(password)) {
        if (dbConfigured()) await audit({ staffId: null, actor: 'secours', action: 'login_failed', ip });
        return json(401, { error: BAD });
      }
      if (dbConfigured()) await clearFails(['backup', ipKey]);
      cookies.set(COOKIE, makeToken({ staffId: 0, role: 'direction', sv: 0 }), cookieOptions(secure));
      await audit({ staffId: null, actor: 'secours', action: 'login', ip });
      return json(200, { ok: true, role: 'direction', next: '/admin/' });
    }

    if (!dbConfigured()) return json(503, { error: 'Base de données non configurée.' });
    const account = `u:${login}`;
    // La tentative est comptée avant la vérification : des essais simultanés ne dépassent pas le seuil.
    const a = await attempt(limitsFor(account, ipKey));
    if (a.locked) return json(429, { error: LOCKED });
    const staff = await findByLogin(login);
    const ok = await verifySecret(password, staff?.secretHash ?? (await dummyHash()), pepper());
    if (!staff || !staff.active || !ok) {
      if (a.fails === 1) await audit({ staffId: staff?.id ?? null, actor: 'staff', action: 'login_failed', entityType: 'staff', entityId: staff?.id, ip });
      return json(401, { error: BAD });
    }
    await clearFails([account, ipKey]);
    await purgeStale();
    await touchLogin(staff.id);
    cookies.set(COOKIE, makeToken({ staffId: staff.id, role: staff.role, sv: staff.sessionVersion }), cookieOptions(secure));
    await audit({ staffId: staff.id, actor: 'staff', action: 'login', entityType: 'staff', entityId: staff.id, ip });
    return json(200, { ok: true, role: staff.role, next: staff.role === 'direction' ? '/admin/' : '/admin/hotel/' });
  } catch (e) {
    console.error('[login]', (e as Error).message);
    return json(503, { error: 'Connexion momentanément impossible.' });
  }
};

export const DELETE: APIRoute = async ({ request, cookies }) => {
  // Le cookie de session est posé avec Secure en HTTPS : le navigateur refuse de l'effacer par un cookie sans Secure.
  // On reprend donc les mêmes attributs que ceux de la connexion.
  const secure = new URL(request.url).protocol === 'https:';
  cookies.delete(COOKIE, { path: '/', httpOnly: true, secure, sameSite: 'lax' });
  // Filet de sécurité : si le navigateur refuse d'effacer le cookie, Clear-Site-Data le supprime de force (HTTPS seulement).
  const res = json(200, { ok: true });
  if (secure) res.headers.set('clear-site-data', '"cookies"');
  return res;
};
