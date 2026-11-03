import type { APIRoute } from 'astro';
import { COOKIE, adminConfigured, checkPassword, cookieOptions, makeToken, sameOrigin, tooManyAttempts } from '../../../lib/auth';

export const prerender = false;

const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  if (!sameOrigin(request)) return json(403, { error: 'forbidden' });
  if (!adminConfigured()) return json(503, { error: 'not_configured' });
  if (tooManyAttempts(clientAddress ?? 'x')) return json(429, { error: 'Trop de tentatives, réessayez plus tard.' });
  const { password } = await request.json().catch(() => ({ password: '' }));
  if (typeof password !== 'string' || !checkPassword(password)) return json(401, { error: 'Mot de passe incorrect.' });
  cookies.set(COOKIE, makeToken(), cookieOptions(new URL(request.url).protocol === 'https:'));
  return json(200, { ok: true });
};

export const DELETE: APIRoute = async ({ cookies }) => {
  cookies.delete(COOKIE, { path: '/' });
  return json(200, { ok: true });
};
