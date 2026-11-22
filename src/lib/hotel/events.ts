// Groupes et séminaires : accès à la base. Serveur uniquement. La logique pure est dans events-core.ts.
import { sql } from '../db';
import {
  blocksSpace, computeQuote, eventReference, type AttendeeInput, type BlockInput, type EventInput, type EventStatus, type PricedLine,
  type QuoteLine, type SlotInput, type SpaceInput,
} from './events-core';
import { createStay } from './stays';
import { cleanStay } from './validate';

const code23 = (e: unknown) => (e as { code?: string }).code;
const busyMsg = 'La salle est déjà retenue par un autre dossier sur tout ou partie de ce créneau.';
const staffOrNull = (id: number | null) => (id && id > 0 ? id : null);

// ---------- Salles ----------

export type Space = { id: number; name: string; capacity: number | null; active: boolean };

export async function listSpaces(): Promise<Space[]> {
  return (await sql().query(`select id::int as id, name, capacity::int as capacity, active from spaces order by active desc, lower(name)`)) as Space[];
}

export async function createSpace(v: SpaceInput): Promise<{ space: Space } | { error: string }> {
  try {
    const r = (await sql().query(`insert into spaces (name, capacity) values ($1,$2) returning id::int as id, name, capacity::int as capacity, active`, [v.name, v.capacity])) as Space[];
    return { space: r[0] };
  } catch (e) {
    if (code23(e) === '23505') return { error: 'Une salle porte déjà ce nom.' };
    throw e;
  }
}

export async function updateSpace(id: number, v: SpaceInput & { active: boolean }): Promise<{ space: Space } | { error: string }> {
  try {
    const r = (await sql().query(`update spaces set name=$2, capacity=$3, active=$4 where id=$1 returning id::int as id, name, capacity::int as capacity, active`, [id, v.name, v.capacity, v.active])) as Space[];
    return r[0] ? { space: r[0] } : { error: 'Salle inconnue.' };
  } catch (e) {
    if (code23(e) === '23505') return { error: 'Une salle porte déjà ce nom.' };
    throw e;
  }
}

// ---------- Dossiers ----------

export type EventRow = {
  id: number; reference: string; title: string; clientName: string; contactName: string; contactPhone: string; contactEmail: string;
  attendees: number; status: EventStatus; optionUntil: string | null; notes: string; layout: string; equipment: string; breaksNote: string;
  mealsNote: string; quoteNote: string; version: number;
};

const EVENT_COLS = `e.id::int as id, e.reference, e.title, e.client_name as "clientName", e.contact_name as "contactName", e.contact_phone as "contactPhone",
  e.contact_email as "contactEmail", e.attendees::int as attendees, e.status, to_char(e.option_until,'YYYY-MM-DD') as "optionUntil", e.notes, e.layout,
  e.equipment, e.breaks_note as "breaksNote", e.meals_note as "mealsNote", e.quote_note as "quoteNote", e.version::int as version`;

export type EventListItem = {
  id: number; reference: string; title: string; clientName: string; status: EventStatus; attendees: number; optionUntil: string | null;
  firstDate: string | null; lastDate: string | null; total: number;
};

export async function listEvents(statuses: EventStatus[] | null): Promise<EventListItem[]> {
  return (await sql().query(
    `select e.id::int as id, e.reference, e.title, e.client_name as "clientName", e.status, e.attendees::int as attendees,
       to_char(e.option_until,'YYYY-MM-DD') as "optionUntil",
       (select to_char(min(slot_date),'YYYY-MM-DD') from event_slots where event_id = e.id) as "firstDate",
       (select to_char(max(slot_date),'YYYY-MM-DD') from event_slots where event_id = e.id) as "lastDate",
       coalesce((select sum(unit_fcfa::bigint * qty)::bigint from event_lines where event_id = e.id), 0)::float8 as total
     from events e
     where ($1::text[] is null or e.status = any($1::text[]))
     order by coalesce((select min(slot_date) from event_slots where event_id = e.id), date '2999-01-01'), e.id desc
     limit 300`,
    [statuses],
  )) as EventListItem[];
}

async function nextReference(year: number): Promise<string> {
  const r = (await sql().query(
    `insert into doc_counters (key, value) values ($1, 1) on conflict (key) do update set value = doc_counters.value + 1 returning value::int as value`,
    [`GRP-${year}`],
  )) as { value: number }[];
  return eventReference(year, r[0].value);
}

export async function createEvent(v: EventInput, year: number, staffId: number | null): Promise<EventRow> {
  const reference = await nextReference(year);
  const r = (await sql().query(
    `insert into events (reference, title, client_name, contact_name, contact_phone, contact_email, attendees, option_until, notes, layout, equipment, breaks_note, meals_note, quote_note, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id::int as id`,
    [reference, v.title, v.clientName, v.contactName, v.contactPhone, v.contactEmail, v.attendees, v.optionUntil, v.notes, v.layout, v.equipment, v.breaksNote, v.mealsNote, v.quoteNote, staffOrNull(staffId)],
  )) as { id: number }[];
  return (await getEvent(r[0].id))!;
}

export async function getEvent(id: number): Promise<EventRow | null> {
  return ((await sql().query(`select ${EVENT_COLS} from events e where e.id = $1`, [id])) as EventRow[])[0] ?? null;
}

export async function updateEvent(id: number, v: EventInput): Promise<EventRow | null> {
  const r = (await sql().query(
    `update events set title=$2, client_name=$3, contact_name=$4, contact_phone=$5, contact_email=$6, attendees=$7, option_until=$8, notes=$9, layout=$10,
       equipment=$11, breaks_note=$12, meals_note=$13, quote_note=$14, version=version+1, updated_at=now() where id=$1 returning id`,
    [id, v.title, v.clientName, v.contactName, v.contactPhone, v.contactEmail, v.attendees, v.optionUntil, v.notes, v.layout, v.equipment, v.breaksNote, v.mealsNote, v.quoteNote],
  )) as unknown[];
  return r.length ? getEvent(id) : null;
}

// Change le statut. Les créneaux retiennent la salle selon le statut ; si un autre dossier la retient déjà, rien ne change.
export async function setStatus(id: number, status: EventStatus): Promise<{ event: EventRow } | { error: string; code: 404 | 409 }> {
  const cur = await getEvent(id);
  if (!cur) return { error: 'Dossier inconnu.', code: 404 };
  try {
    await sql().query(`update event_slots set blocking = $2 where event_id = $1`, [id, blocksSpace(status)]);
  } catch (e) {
    if (code23(e) === '23P01') return { error: `${busyMsg} Le statut n’a pas été changé.`, code: 409 };
    throw e;
  }
  await sql().query(`update events set status=$2, version=version+1, updated_at=now() where id=$1`, [id, status]);
  return { event: (await getEvent(id))! };
}

// ---------- Créneaux ----------

export type Slot = { id: number; spaceId: number; spaceName: string; date: string; start: string; end: string; label: string; blocking: boolean };
const SLOT_SELECT = `select t.id::int as id, t.space_id::int as "spaceId", s.name as "spaceName", to_char(t.slot_date,'YYYY-MM-DD') as date,
  to_char(t.start_time,'HH24:MI') as start, to_char(t.end_time,'HH24:MI') as "end", t.label, t.blocking
  from event_slots t join spaces s on s.id = t.space_id`;

export const listSlots = async (eventId: number): Promise<Slot[]> =>
  (await sql().query(`${SLOT_SELECT} where t.event_id = $1 order by t.slot_date, t.start_time, t.id`, [eventId])) as Slot[];

export async function addSlot(eventId: number, status: EventStatus, v: SlotInput): Promise<{ slot: Slot } | { error: string }> {
  const sp = (await sql().query(`select active from spaces where id = $1`, [v.spaceId])) as { active: boolean }[];
  if (!sp[0]) return { error: 'Salle inconnue.' };
  if (!sp[0].active) return { error: 'Cette salle n’est plus utilisée.' };
  try {
    const r = (await sql().query(
      `insert into event_slots (event_id, space_id, slot_date, start_time, end_time, label, blocking) values ($1,$2,$3,$4,$5,$6,$7) returning id::int as id`,
      [eventId, v.spaceId, v.date, v.start, v.end, v.label, blocksSpace(status)],
    )) as { id: number }[];
    return { slot: ((await sql().query(`${SLOT_SELECT} where t.id = $1`, [r[0].id])) as Slot[])[0] };
  } catch (e) {
    if (code23(e) === '23P01') return { error: busyMsg };
    throw e;
  }
}

export async function deleteSlot(eventId: number, id: number): Promise<boolean> {
  return ((await sql().query(`delete from event_slots where id = $1 and event_id = $2 returning id`, [id, eventId])) as unknown[]).length > 0;
}

// Calendrier des salles : créneaux de la période, dossiers annulés exclus.
export type CalendarSlot = Slot & { eventId: number; reference: string; title: string; status: EventStatus; clientName: string };
export async function calendar(from: string, to: string): Promise<CalendarSlot[]> {
  return (await sql().query(
    `select t.id::int as id, t.space_id::int as "spaceId", s.name as "spaceName", to_char(t.slot_date,'YYYY-MM-DD') as date,
       to_char(t.start_time,'HH24:MI') as start, to_char(t.end_time,'HH24:MI') as "end", t.label, t.blocking,
       e.id::int as "eventId", e.reference, e.title, e.status, e.client_name as "clientName"
     from event_slots t join spaces s on s.id = t.space_id join events e on e.id = t.event_id
     where e.status <> 'cancelled' and t.slot_date between $1::date and $2::date order by t.slot_date, t.start_time, t.id`,
    [from, to],
  )) as CalendarSlot[];
}

// ---------- Lignes du devis ----------

export type Line = QuoteLine & { id: number };
export const listLines = async (eventId: number): Promise<Line[]> =>
  (await sql().query(`select id::int as id, label, detail, unit_fcfa::int as "unitFcfa", qty::int as qty from event_lines where event_id = $1 order by position, id`, [eventId])) as Line[];

export async function addLines(eventId: number, lines: QuoteLine[]): Promise<void> {
  const pos = (await sql().query(`select coalesce(max(position), 0)::int as p from event_lines where event_id = $1`, [eventId])) as { p: number }[];
  let p = pos[0].p;
  for (const l of lines) {
    p += 1;
    await sql().query(`insert into event_lines (event_id, position, label, detail, unit_fcfa, qty) values ($1,$2,$3,$4,$5,$6)`, [eventId, p, l.label, l.detail, l.unitFcfa, l.qty]);
  }
}

export async function updateLine(eventId: number, id: number, l: QuoteLine): Promise<boolean> {
  return ((await sql().query(`update event_lines set label=$3, detail=$4, unit_fcfa=$5, qty=$6 where id=$1 and event_id=$2 returning id`, [id, eventId, l.label, l.detail, l.unitFcfa, l.qty])) as unknown[]).length > 0;
}

export async function deleteLine(eventId: number, id: number): Promise<boolean> {
  return ((await sql().query(`delete from event_lines where id=$1 and event_id=$2 returning id`, [id, eventId])) as unknown[]).length > 0;
}

// ---------- Bloc de chambres ----------

export type Block = { id: number; roomTypeId: number | null; roomTypeLabel: string; rooms: number; arrival: string; departure: string; note: string };
export const listBlocks = async (eventId: number): Promise<Block[]> =>
  (await sql().query(
    `select b.id::int as id, b.room_type_id::int as "roomTypeId", coalesce(t.label, 'Tout type') as "roomTypeLabel", b.rooms::int as rooms,
       to_char(b.arrival,'YYYY-MM-DD') as arrival, to_char(b.departure,'YYYY-MM-DD') as departure, b.note
     from event_room_blocks b left join room_types t on t.id = b.room_type_id where b.event_id = $1 order by b.arrival, b.id`, [eventId])) as Block[];

export async function addBlock(eventId: number, v: BlockInput): Promise<{ ok: true } | { error: string }> {
  try {
    await sql().query(`insert into event_room_blocks (event_id, room_type_id, rooms, arrival, departure, note) values ($1,$2,$3,$4,$5,$6)`, [eventId, v.roomTypeId, v.rooms, v.arrival, v.departure, v.note]);
    return { ok: true };
  } catch (e) {
    if (code23(e) === '23503') return { error: 'Type de chambre inconnu.' };
    throw e;
  }
}

export async function deleteBlock(eventId: number, id: number): Promise<boolean> {
  return ((await sql().query(`delete from event_room_blocks where id=$1 and event_id=$2 returning id`, [id, eventId])) as unknown[]).length > 0;
}

// ---------- Participants ----------

export type Attendee = { id: number; name: string; company: string; diet: string; stayId: number | null; roomNumber: string | null };
export const listAttendees = async (eventId: number): Promise<Attendee[]> =>
  (await sql().query(
    `select a.id::int as id, a.name, a.company, a.diet, a.stay_id::int as "stayId", r.number as "roomNumber"
     from event_attendees a left join stays s on s.id = a.stay_id and s.status = 'booked' left join rooms r on r.id = s.room_id
     where a.event_id = $1 order by lower(a.name), a.id`, [eventId])) as Attendee[];

export async function addAttendees(eventId: number, list: AttendeeInput[]): Promise<number> {
  for (const a of list) await sql().query(`insert into event_attendees (event_id, name, company, diet) values ($1,$2,$3,$4)`, [eventId, a.name, a.company, a.diet]);
  return list.length;
}

export async function updateAttendee(eventId: number, id: number, a: AttendeeInput): Promise<boolean> {
  return ((await sql().query(`update event_attendees set name=$3, company=$4, diet=$5 where id=$1 and event_id=$2 returning id`, [id, eventId, a.name, a.company, a.diet])) as unknown[]).length > 0;
}

export async function deleteAttendee(eventId: number, id: number): Promise<boolean> {
  return ((await sql().query(`delete from event_attendees where id=$1 and event_id=$2 returning id`, [id, eventId])) as unknown[]).length > 0;
}

// Crée le séjour d'un participant dans la chambre choisie et le relie. Un seul séjour par participant.
export async function createAttendeeStay(
  eventId: number, id: number, b: { roomId: unknown; arrival: unknown; departure: unknown }, reference: string, staffId: number | null,
): Promise<{ stayId: number } | { error: string; code: 400 | 404 | 409 }> {
  const at = ((await sql().query(`select name, stay_id::int as "stayId" from event_attendees where id=$1 and event_id=$2`, [id, eventId])) as { name: string; stayId: number | null }[])[0];
  if (!at) return { error: 'Participant inconnu.', code: 404 };
  if (at.stayId) return { error: 'Un séjour est déjà relié à ce participant.', code: 409 };
  const c = cleanStay({ roomId: b.roomId, guestName: at.name, guests: 1, arrival: b.arrival, departure: b.departure, notes: `Groupe ${reference}` });
  if (!c.ok) return { error: c.error, code: 400 };
  const r = await createStay(c.value, staffId);
  if ('error' in r) return { error: r.error, code: 409 };
  await sql().query(`update event_attendees set stay_id=$3 where id=$1 and event_id=$2`, [id, eventId, r.stay.id]);
  return { stayId: r.stay.id };
}

// ---------- Dossier complet ----------

export type EventFull = {
  event: EventRow; slots: Slot[]; lines: PricedLine[]; total: number | null; blocks: Block[]; attendees: Attendee[];
  spaces: Space[]; roomTypes: { id: number; label: string }[];
};

// « withMoney » : prix, coordonnées du contact et noms des participants sont réservés à la direction et à la réception.
export async function getEventFull(id: number, withMoney: boolean): Promise<EventFull | null> {
  const event = await getEvent(id);
  if (!event) return null;
  const [slots, lines, blocks, attendees, spaces, roomTypes] = await Promise.all([
    listSlots(id), listLines(id), listBlocks(id), listAttendees(id), listSpaces(),
    (async () => (await sql().query(`select id::int as id, label from room_types order by label`)) as { id: number; label: string }[])(),
  ]);
  const q = computeQuote(lines);
  if (withMoney) return { event, slots, lines: q.lines, total: q.total, blocks, attendees, spaces, roomTypes };
  return {
    event: { ...event, contactName: '', contactPhone: '', contactEmail: '', clientName: '', quoteNote: '' },
    slots, lines: [], total: null, blocks,
    attendees: attendees.map((a) => ({ ...a, name: '', company: '' })), spaces, roomTypes,
  };
}
