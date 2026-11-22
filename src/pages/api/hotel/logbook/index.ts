import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { addEntry, listEntries } from '../../../../lib/hotel/logbook';
import { canEdit } from '../../../../lib/hotel/permissions';
import { cleanLogEntry } from '../../../../lib/hotel/today';

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  const u = locals.user!;
  try { return json(200, { entries: await listEntries(u.id), canManage: canEdit(u.role, 'logbook'), canAck: u.id > 0 }); }
  catch (e) { return unavailable('logbook', e); }
};

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  const c = cleanLogEntry(await readJson(request));
  if (!c.ok) return json(400, { error: c.error });
  try {
    const id = await addEntry(c.value.body, u.id);
    await audit({ staffId: u.id, actor: actorOf(u), action: 'logbook_post', entityType: 'logbook_entry', entityId: id, ip: safeIp(() => clientAddress) });
    return json(201, { id });
  } catch (e) { return unavailable('logbook', e); }
};
