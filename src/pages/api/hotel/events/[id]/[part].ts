import type { APIRoute } from 'astro';
import { getContent } from '../../../../../lib/content';
import { json, readJson } from '../../../../../lib/http';
import { actorOf, idParam, safeIp, toInt, unavailable } from '../../../../../lib/hotel/api';
import { audit } from '../../../../../lib/hotel/audit';
import {
  addAttendees, addBlock, addLines, addSlot, createAttendeeStay, deleteAttendee, deleteBlock, deleteLine, deleteSlot, getEvent, listAttendees,
  listLines, updateAttendee, updateLine,
} from '../../../../../lib/hotel/events';
import { cleanAttendee, cleanBlock, cleanLine, cleanSlot, parseAttendees, suggestLines } from '../../../../../lib/hotel/events-core';
import { canEdit } from '../../../../../lib/hotel/permissions';

export const prerender = false;

const PARTS = ['slots', 'lines', 'blocks', 'attendees'] as const;
type Part = (typeof PARTS)[number];
const isPart = (v: string | undefined): v is Part => !!v && (PARTS as readonly string[]).includes(v);

// Éléments d'un dossier : créneaux, lignes du devis, bloc de chambres, participants. Écriture : direction et réception.
async function prepare(params: Record<string, string | undefined>, locals: App.Locals) {
  const u = locals.user!;
  if (!canEdit(u.role, 'events')) return { res: json(403, { error: 'forbidden' }) };
  const id = idParam(params.id);
  if (!id || !isPart(params.part)) return { res: json(400, { error: 'Dossier inconnu.' }) };
  const ev = await getEvent(id);
  if (!ev) return { res: json(404, { error: 'Dossier inconnu.' }) };
  return { u, id, part: params.part, ev };
}

export const POST: APIRoute = async ({ params, request, locals, clientAddress }) => {
  try {
    const p = await prepare(params, locals);
    if ('res' in p && p.res) return p.res;
    const { u, id, part, ev } = p as Exclude<typeof p, { res: Response }>;
    const b = await readJson(request);
    const ip = safeIp(() => clientAddress);
    const log = (action: string, diff?: Record<string, unknown>) => audit({ staffId: u.id, actor: actorOf(u), action, entityType: 'event', entityId: id, diff: { reference: ev.reference, ...diff }, ip });

    if (part === 'slots') {
      const c = cleanSlot(b);
      if (!c.ok) return json(400, { error: c.error });
      const r = await addSlot(id, ev.status, c.value);
      if ('error' in r) return json(409, { error: r.error });
      await log('event_slot_add', { date: c.value.date, start: c.value.start, end: c.value.end });
      return json(201, { slot: r.slot });
    }
    if (part === 'lines') {
      if (b.suggest && typeof b.suggest === 'object') {
        const s = b.suggest as Record<string, unknown>;
        const days = toInt(s.days, 1, 30), people = toInt(s.people, 1, 1000), breaksPerDay = toInt(s.breaksPerDay ?? 0, 0, 10);
        if (days === null || people === null || breaksPerDay === null) return json(400, { error: 'Jours (1 à 30), personnes (1 à 1000) et pauses par jour (0 à 10) attendus.' });
        const tarifs = (await getContent()).tarifs.seminaire;
        const lines = suggestLines(tarifs, { days, people, breaksPerDay });
        await addLines(id, lines);
        await log('event_lines_suggest', { count: lines.length });
        return json(201, { lines: await listLines(id) });
      }
      const c = cleanLine(b);
      if (!c.ok) return json(400, { error: c.error });
      await addLines(id, [c.value]);
      await log('event_line_add', { label: c.value.label });
      return json(201, { lines: await listLines(id) });
    }
    if (part === 'blocks') {
      const c = cleanBlock(b);
      if (!c.ok) return json(400, { error: c.error });
      const r = await addBlock(id, c.value);
      if ('error' in r) return json(400, { error: r.error });
      await log('event_block_add', { rooms: c.value.rooms });
      return json(201, { ok: true });
    }
    // attendees : un participant, ou une liste collée (« text »)
    if (typeof b.text === 'string') {
      const l = parseAttendees(b.text);
      if (!l.ok) return json(400, { error: l.error });
      const n = await addAttendees(id, l.value);
      await log('event_attendees_import', { count: n });
      return json(201, { added: n, attendees: await listAttendees(id) });
    }
    const c = cleanAttendee(b);
    if (!c.ok) return json(400, { error: c.error });
    await addAttendees(id, [c.value]);
    await log('event_attendee_add');
    return json(201, { attendees: await listAttendees(id) });
  } catch (e) { return unavailable('groupes', e); }
};

export const PATCH: APIRoute = async ({ params, request, url, locals, clientAddress }) => {
  try {
    const p = await prepare(params, locals);
    if ('res' in p && p.res) return p.res;
    const { u, id, part, ev } = p as Exclude<typeof p, { res: Response }>;
    const item = idParam(url.searchParams.get('item') ?? undefined);
    if (!item) return json(400, { error: 'Élément inconnu.' });
    const b = await readJson(request);
    const ip = safeIp(() => clientAddress);
    if (part === 'lines') {
      const cur = (await listLines(id)).find((l) => l.id === item);
      if (!cur) return json(404, { error: 'Ligne inconnue.' });
      const c = cleanLine({ ...cur, ...b });
      if (!c.ok) return json(400, { error: c.error });
      await updateLine(id, item, c.value);
      await audit({ staffId: u.id, actor: actorOf(u), action: 'event_line_update', entityType: 'event', entityId: id, diff: { reference: ev.reference, label: c.value.label }, ip });
      return json(200, { lines: await listLines(id) });
    }
    if (part === 'attendees') {
      if (b.createStay && typeof b.createStay === 'object') {
        const s = b.createStay as Record<string, unknown>;
        const r = await createAttendeeStay(id, item, { roomId: s.roomId, arrival: s.arrival, departure: s.departure }, ev.reference, u.id);
        if ('error' in r) return json(r.code, { error: r.error });
        await audit({ staffId: u.id, actor: actorOf(u), action: 'event_attendee_stay', entityType: 'stay', entityId: r.stayId, diff: { reference: ev.reference }, ip });
        return json(200, { attendees: await listAttendees(id) });
      }
      const cur = (await listAttendees(id)).find((a) => a.id === item);
      if (!cur) return json(404, { error: 'Participant inconnu.' });
      const c = cleanAttendee({ ...cur, ...b });
      if (!c.ok) return json(400, { error: c.error });
      await updateAttendee(id, item, c.value);
      return json(200, { attendees: await listAttendees(id) });
    }
    return json(405, { error: 'Supprimez puis recréez cet élément.' });
  } catch (e) { return unavailable('groupes', e); }
};

export const DELETE: APIRoute = async ({ params, url, locals, clientAddress }) => {
  try {
    const p = await prepare(params, locals);
    if ('res' in p && p.res) return p.res;
    const { u, id, part, ev } = p as Exclude<typeof p, { res: Response }>;
    const item = idParam(url.searchParams.get('item') ?? undefined);
    if (!item) return json(400, { error: 'Élément inconnu.' });
    const done = part === 'slots' ? await deleteSlot(id, item) : part === 'lines' ? await deleteLine(id, item) : part === 'blocks' ? await deleteBlock(id, item) : await deleteAttendee(id, item);
    if (!done) return json(404, { error: 'Élément inconnu.' });
    await audit({ staffId: u.id, actor: actorOf(u), action: `event_${part}_delete`, entityType: 'event', entityId: id, diff: { reference: ev.reference }, ip: safeIp(() => clientAddress) });
    return json(200, { ok: true });
  } catch (e) { return unavailable('groupes', e); }
};
