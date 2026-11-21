import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { mapItems } from '../../../../lib/hotel/items';
import { canEdit } from '../../../../lib/hotel/permissions';
import { importItems } from '../../../../lib/hotel/stock';

export const prerender = false;

const MAX_ROWS = 2000;

// Import du catalogue : le navigateur envoie les lignes brutes et le choix des colonnes, le serveur refait la lecture et le contrôle.
export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'linen')) return json(403, { error: 'forbidden' });
  const b = await readJson(request);
  if (!Array.isArray(b.rows) || b.rows.length === 0 || b.rows.length > MAX_ROWS) return json(400, { error: `Fichier vide ou trop long (${MAX_ROWS} lignes au maximum).` });
  const rows = b.rows.map((r) => (Array.isArray(r) ? r.map((x) => String(x ?? '').slice(0, 300)) : []));
  const map = b.mapping && typeof b.mapping === 'object' && !Array.isArray(b.mapping) ? (b.mapping as Record<string, unknown>) : {};
  const mapping: Record<string, number> = {};
  for (const [k, v] of Object.entries(map)) mapping[k] = Number.isInteger(v) ? (v as number) : -1;
  const m = mapItems(rows, mapping);
  if (b.dryRun === true) return json(200, { dryRun: true, valid: m.rows.length, errors: m.errors });
  try {
    const res = await importItems(m.rows, u.id);
    await audit({ staffId: u.id, actor: actorOf(u), action: 'import_items', diff: { created: res.created, updated: res.updated, errors: m.errors.length + res.errors.length }, ip: safeIp(() => clientAddress) });
    return json(200, { created: res.created, updated: res.updated, errors: [...m.errors, ...res.errors].sort((a, c) => a.line - c.line).map((e) => `Ligne ${e.line} : ${e.message}`) });
  } catch (e) { return unavailable('import-items', e); }
};
