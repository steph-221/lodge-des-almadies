import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { mailConfigured } from '../../../../lib/mail';
import { getAlertEmails, setAlertEmails } from '../../../../lib/hotel/notify';
import { canEdit } from '../../../../lib/hotel/permissions';

export const prerender = false;

// Adresses qui reçoivent l'alerte de chaque service (direction seulement).
export const GET: APIRoute = async ({ locals }) => {
  if (!canEdit(locals.user!.role, 'settings')) return json(403, { error: 'forbidden' });
  try { return json(200, { value: await getAlertEmails(), mailReady: mailConfigured() }); } catch (e) { return unavailable('alertes', e); }
};

export const PUT: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'settings')) return json(403, { error: 'forbidden' });
  try {
    const r = await setAlertEmails(await readJson(request), u.id);
    if ('error' in r) return json(400, { error: r.error });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'alert_emails_set', diff: { counts: Object.fromEntries(Object.entries(r.value).map(([k, v]) => [k, v.length])) }, ip: safeIp(() => clientAddress) });
    return json(200, { value: r.value });
  } catch (e) { return unavailable('alertes', e); }
};
