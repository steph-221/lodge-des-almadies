import type { APIRoute } from 'astro';
import { COOKIE, isAdmin, sameOrigin } from '../../../lib/auth';
import { getContent, getDefaults, saveContent, type Content } from '../../../lib/content';

export const prerender = false;

const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

// Vérifie la forme minimale : les clés de premier niveau doivent garder le même type que le contenu par défaut.
function valid(next: any, ref: any): string | null {
  if (!next || typeof next !== 'object') return 'Contenu invalide';
  for (const k of Object.keys(ref)) {
    if (!(k in next)) return `Section manquante : ${k}`;
    if (Array.isArray(ref[k]) !== Array.isArray(next[k]) || typeof ref[k] !== typeof next[k]) return `Type invalide : ${k}`;
  }
  if (typeof next.rate !== 'number' || next.rate <= 0) return 'Taux de change invalide';
  if (next.booking.url && !/^https:\/\//.test(next.booking.url)) return 'L’URL de réservation doit commencer par https://';
  return null;
}

export const GET: APIRoute = async ({ cookies }) => {
  if (!isAdmin(cookies.get(COOKIE)?.value)) return json(401, { error: 'unauthorized' });
  return json(200, await getContent());
};

export const PUT: APIRoute = async ({ request, cookies }) => {
  if (!sameOrigin(request) || !isAdmin(cookies.get(COOKIE)?.value)) return json(401, { error: 'unauthorized' });
  const next = (await request.json().catch(() => null)) as Content | null;
  const err = valid(next, getDefaults());
  if (err) return json(400, { error: err });
  try {
    await saveContent(next!);
  } catch (e) {
    return json(500, { error: 'Enregistrement impossible : ' + (e as Error).message });
  }
  return json(200, { ok: true });
};

// Remet le contenu aux valeurs par défaut du dépôt.
export const DELETE: APIRoute = async ({ request, cookies }) => {
  if (!sameOrigin(request) || !isAdmin(cookies.get(COOKIE)?.value)) return json(401, { error: 'unauthorized' });
  await saveContent(getDefaults());
  return json(200, { ok: true });
};
