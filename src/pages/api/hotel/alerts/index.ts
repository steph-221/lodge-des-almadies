import type { APIRoute } from 'astro';
import { json, readJson } from '../../../../lib/http';
import { actorOf, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { mailConfigured } from '../../../../lib/mail';
import { whatsappConfigured } from '../../../../lib/whatsapp';
import { getAlertEmails, getAlertPhones, setAlertEmails, setAlertPhones } from '../../../../lib/hotel/notify';
import { canEdit } from '../../../../lib/hotel/permissions';

export const prerender = false;

// Adresses qui reçoivent l'alerte de chaque service (direction seulement).
export const GET: APIRoute = async ({ locals }) => {
  if (!canEdit(locals.user!.role, 'settings')) return json(403, { error: 'forbidden' });
  try { return json(200, { value: await getAlertEmails(), whatsapp: await getAlertPhones(), mailReady: mailConfigured(), whatsappReady: whatsappConfigured() }); } catch (e) { return unavailable('alertes', e); }
};

export const PUT: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'settings')) return json(403, { error: 'forbidden' });
  try {
    const body = await readJson(request);
    const r = await setAlertEmails(body, u.id);
    if ('error' in r) return json(400, { error: r.error });
    const counts = (v: Record<string, string[]>) => Object.fromEntries(Object.entries(v).map(([k, l]) => [k, l.length]));
    let wa: Record<string, string[]> | undefined;
    if (body.whatsapp && typeof body.whatsapp === 'object') {
      const w = await setAlertPhones(body.whatsapp as Record<string, unknown>, u.id);
      if ('error' in w) return json(400, { error: w.error });
      wa = w.value;
    }
    await audit({ staffId: u.id, actor: actorOf(u), action: 'alert_emails_set', diff: { counts: counts(r.value), whatsapp: wa ? counts(wa) : undefined }, ip: safeIp(() => clientAddress) });
    return json(200, { value: r.value, whatsapp: wa });
  } catch (e) { return unavailable('alertes', e); }
};
