import type { APIRoute } from 'astro';
import { sameOrigin } from '../../../lib/auth';
import { json, readJson } from '../../../lib/http';
import { safeIp } from '../../../lib/hotel/api';
import { audit, ipHash } from '../../../lib/hotel/audit';
import { appOrigin, notifyService } from '../../../lib/hotel/notify';
import { createRequest, roomForToken, roomIsOpen } from '../../../lib/hotel/requests';
import { cleanGuestRequest, isTokenShape, pickLang } from '../../../lib/hotel/requests-core';
import { todayDakar } from '../../../lib/hotel/tasks';
import { attempt } from '../../../lib/hotel/throttle';

export const prerender = false;

const T = {
  fr: { busy: 'Trop de demandes en peu de temps. Merci de patienter ou d’appeler la réception.', closed: 'Cette chambre n’est pas ouverte aux demandes. Merci de vous adresser à la réception.', unknown: 'Demande inconnue.', note: 'Merci de préciser votre demande.', down: 'Service momentanément indisponible. Merci d’appeler la réception.', ok: 'Votre demande a été transmise.' },
  en: { busy: 'Too many requests in a short time. Please wait or call the front desk.', closed: 'This room is not open for requests. Please contact the front desk.', unknown: 'Unknown request.', note: 'Please add a few details.', down: 'Service temporarily unavailable. Please call the front desk.', ok: 'Your request has been sent.' },
};

// Page cliente (QR code) : pas de compte, le jeton secret de la chambre fait foi. Limites par adresse et par chambre.
export const POST: APIRoute = async ({ request, clientAddress, url }) => {
  const b = await readJson(request);
  const lang = pickLang(typeof b.lang === 'string' ? b.lang : null, request.headers.get('accept-language'));
  const t = T[lang];
  if (!sameOrigin(request)) return json(403, { error: 'forbidden' });
  // Champ piège invisible : un robot le remplit, une personne jamais. Réponse de succès, rien n'est enregistré.
  if (typeof b.website === 'string' && b.website !== '') return json(200, { ok: true, message: t.ok });
  if (!isTokenShape(b.token)) return json(404, { error: t.unknown });
  try {
    const ip = ipHash(safeIp(() => clientAddress)) ?? 'inconnue';
    if ((await attempt([{ key: `guest:ip:${ip}`, max: 30 }])).locked) return json(429, { error: t.busy });
    const room = await roomForToken(b.token);
    if (!room) return json(404, { error: t.unknown });
    if ((await attempt([{ key: `guest:room:${room.id}`, max: 8 }])).locked) return json(429, { error: t.busy });
    const today = todayDakar();
    if (!(await roomIsOpen(room.id, today))) return json(403, { error: t.closed });
    const c = cleanGuestRequest(b, lang);
    if (!c.ok) return json(400, { error: c.error });
    const r = await createRequest({ roomId: room.id, catalogId: c.value.catalogId, qty: c.value.qty, note: c.value.note, source: 'guest', lang }, null, today);
    if ('error' in r) return json(r.error === 'note_required' ? 400 : 404, { error: r.error === 'note_required' ? t.note : t.unknown });
    await audit({ staffId: null, actor: 'client', action: 'request_create', entityType: 'request', entityId: r.id, diff: { roomId: room.id, catalogId: c.value.catalogId }, ip: safeIp(() => clientAddress) });
    await notifyService(r.service, 'request', { room: r.roomNumber, title: r.label, qty: c.value.qty, note: c.value.note }, appOrigin(url.origin));
    return json(201, { ok: true, message: t.ok });
  } catch (e) {
    console.error('[demande client]', (e as Error).message);
    return json(503, { error: t.down });
  }
};
