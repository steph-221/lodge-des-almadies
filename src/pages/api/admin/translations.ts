import type { APIRoute } from 'astro';
import { COOKIE, isAdmin, sameOrigin } from '../../../lib/auth';
import { getContent } from '../../../lib/content';
import { baseDictionary } from '../../../lib/i18n';
import { loadTranslations, saveTranslations } from '../../../lib/translations';
import { buildEntries, checkEdit } from '../../../lib/translation-list';

export const prerender = false;

const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

// Liste des phrases du site avec leur traduction anglaise (les manquantes en premier).
export const GET: APIRoute = async ({ cookies }) => {
  if (!isAdmin(cookies.get(COOKIE)?.value)) return json(401, { error: 'unauthorized' });
  const entries = buildEntries(baseDictionary(), await loadTranslations(true), await getContent());
  return json(200, { entries, missing: entries.filter((e) => e.missing).length });
};

// Enregistre (ou, avec une case vide, retire) la correction d'une phrase.
export const PUT: APIRoute = async ({ request, cookies }) => {
  if (!sameOrigin(request) || !isAdmin(cookies.get(COOKIE)?.value)) return json(401, { error: 'unauthorized' });
  const body = (await request.json().catch(() => null)) as { fr?: unknown; en?: unknown } | null;
  const base = baseDictionary();
  const overrides = await loadTranslations(true);
  const allowed = new Set(buildEntries(base, overrides, await getContent()).map((e) => e.fr));
  const err = checkEdit(body?.fr, body?.en, allowed);
  if (err) return json(400, { error: err });
  const fr = body!.fr as string;
  const en = (body!.en as string).trim();
  const next = { ...overrides };
  // Une traduction identique à celle du dépôt n'a pas besoin d'être stockée ; une case vide rétablit celle du dépôt.
  if (!en || en === base[fr]) delete next[fr]; else next[fr] = en;
  try {
    await saveTranslations(next);
  } catch (e) {
    return json(500, { error: 'Enregistrement impossible : ' + (e as Error).message });
  }
  return json(200, { ok: true, en: next[fr] ?? base[fr] ?? '', custom: fr in next });
};
