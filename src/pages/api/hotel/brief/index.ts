import type { APIRoute } from 'astro';
import { driveConfigured } from '../../../../lib/drive';
import { json, readJson } from '../../../../lib/http';
import { mailConfigured } from '../../../../lib/mail';
import { actorOf, safeIp, unavailable } from '../../../../lib/hotel/api';
import { audit } from '../../../../lib/hotel/audit';
import { getRecipients, setRecipients } from '../../../../lib/hotel/brief';
import { canEdit } from '../../../../lib/hotel/permissions';

export const prerender = false;

// Réglage des destinataires de l'e-mail du matin : direction seulement (module « settings », réception en périmètre limité sans accès ici).
export const GET: APIRoute = async ({ locals }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'settings')) return json(403, { error: 'Non autorisé.' });
  try { return json(200, { recipients: await getRecipients(), mailReady: mailConfigured(), driveReady: driveConfigured() }); }
  catch (e) { return unavailable('brief', e); }
};

export const PUT: APIRoute = async ({ request, locals, clientAddress }) => {
  const u = locals.user!;
  if (!canEdit(u.role, 'settings')) return json(403, { error: 'Non autorisé.' });
  const b = await readJson(request);
  if (typeof b.recipients !== 'string') return json(400, { error: 'Liste d’adresses manquante.' });
  try {
    const r = await setRecipients(b.recipients, u.id);
    if ('error' in r) return json(400, { error: r.error });
    await audit({ staffId: u.id, actor: actorOf(u), action: 'brief_recipients', diff: { count: r.value.length }, ip: safeIp(() => clientAddress) });
    return json(200, { recipients: r.value });
  } catch (e) { return unavailable('brief', e); }
};
