import type { APIRoute } from 'astro';
import { json, readJson } from '../../../lib/http';
import { actorOf, safeIp, unavailable } from '../../../lib/hotel/api';
import { audit } from '../../../lib/hotel/audit';
import { mapRooms, mapStays, type LineError } from '../../../lib/hotel/import';
import { canEdit } from '../../../lib/hotel/permissions';
import { importRooms } from '../../../lib/hotel/rooms';
import { importStays } from '../../../lib/hotel/stays';
import { cleanRoom } from '../../../lib/hotel/validate';

export const prerender = false;

const MAX_ROWS = 2000;

// Import d'un tableau (chambres ou séjours). Le navigateur envoie les lignes brutes et le choix des colonnes ;
// le serveur refait lui-même la lecture et le contrôle (rien n'est pris pour acquis).
export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  const b = await readJson(request);
  const kind = b.kind;
  if (kind !== 'rooms' && kind !== 'stays') return json(400, { error: 'Type d’import inconnu.' });
  if (!canEdit(u.role, kind === 'rooms' ? 'rooms' : 'stays')) return json(403, { error: 'forbidden' });
  if (!Array.isArray(b.rows) || b.rows.length === 0 || b.rows.length > MAX_ROWS) return json(400, { error: `Fichier vide ou trop long (${MAX_ROWS} lignes au maximum).` });
  const rows = b.rows.map((r) => (Array.isArray(r) ? r.map((x) => String(x ?? '').slice(0, 300)) : []));
  const map = b.mapping && typeof b.mapping === 'object' && !Array.isArray(b.mapping) ? (b.mapping as Record<string, unknown>) : {};
  const mapping: Record<string, number> = {};
  for (const [k, v] of Object.entries(map)) mapping[k] = Number.isInteger(v) ? (v as number) : -1;
  const dryRun = b.dryRun === true;
  const ip = safeIp(() => clientAddress);

  try {
    if (kind === 'rooms') {
      const m = mapRooms(rows, mapping);
      const errors: LineError[] = [...m.errors];
      const valid = m.rows.filter((r) => {
        const c = cleanRoom({ number: r.number, building: r.building, floor: r.floor, notes: r.notes });
        if (!c.ok) { errors.push({ line: 0, message: `Chambre ${r.number} : ${c.error}` }); return false; }
        return true;
      });
      if (dryRun) return json(200, { dryRun: true, valid: valid.length, errors });
      const res = await importRooms(valid);
      await audit({ staffId: u.id, actor: actorOf(u), action: 'import_rooms', diff: { created: res.created, updated: res.updated, typesCreated: res.typesCreated, errors: errors.length + res.errors.length }, ip });
      return json(200, { ...res, errors: [...errors.map((e) => e.message), ...res.errors.map((e) => `Chambre ${e.number} : ${e.message}`)] });
    }

    const m = mapStays(rows, mapping);
    if (dryRun) return json(200, { dryRun: true, valid: m.rows.length, errors: m.errors });
    const res = await importStays(m.rows, u.id);
    await audit({ staffId: u.id, actor: actorOf(u), action: 'import_stays', diff: { created: res.created, updated: res.updated, skipped: res.skipped, errors: m.errors.length + res.errors.length }, ip });
    return json(200, {
      created: res.created, updated: res.updated, skipped: res.skipped,
      errors: [...m.errors, ...res.errors].sort((a, b2) => a.line - b2.line).map((e) => `Ligne ${e.line} : ${e.message}`),
    });
  } catch (e) { return unavailable('import', e); }
};
