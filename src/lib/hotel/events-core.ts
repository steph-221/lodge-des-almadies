// Logique pure des groupes et séminaires : statuts, devis, créneaux, contrôle des saisies. Testée, sans base ni réseau.
import { parseDate, parseTime } from './import';
import type { Clean } from './validate';

export const EVENT_STATUSES = ['request', 'option', 'quoted', 'confirmed', 'done', 'cancelled'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];
export const isEventStatus = (v: unknown): v is EventStatus => typeof v === 'string' && (EVENT_STATUSES as readonly string[]).includes(v);

export const STATUS_LABEL: Record<EventStatus, string> = {
  request: 'Demande', option: 'Option', quoted: 'Devis envoyé', confirmed: 'Confirmé', done: 'Terminé', cancelled: 'Annulé',
};

// Une demande simple ou un dossier annulé ne retient pas la salle ; l'option, le devis envoyé, le confirmé et le terminé la retiennent.
export const blocksSpace = (s: EventStatus): boolean => s === 'option' || s === 'quoted' || s === 'confirmed' || s === 'done';

const str = (v: unknown, max: number): string | null => {
  if (v == null) return '';
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const s = String(v).trim();
  return s.length <= max ? s : null;
};
const int = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isInteger(n) ? n : null;
};

// ---------- Devis ----------

export type QuoteLine = { label: string; detail: string; unitFcfa: number; qty: number };
export type PricedLine = QuoteLine & { total: number };

export function computeQuote(lines: QuoteLine[]): { lines: PricedLine[]; total: number } {
  const priced = lines.map((l) => ({ ...l, total: l.unitFcfa * l.qty }));
  return { lines: priced, total: priced.reduce((s, l) => s + l.total, 0) };
}

export type Tarif = { label: string; fcfa: number; detail: string };

// Propose des lignes de devis à partir des tarifs séminaire du site (rien n'est écrit en dur). Une ligne « par personne »
// vaut personnes × jours (× nombre de pauses par jour pour une pause) ; les autres valent un par jour. Tout reste modifiable.
export function suggestLines(tarifs: Tarif[], o: { days: number; people: number; breaksPerDay: number }): QuoteLine[] {
  return tarifs.map((t) => {
    const perPerson = /personne/i.test(t.detail);
    const isBreak = /pause/i.test(t.label);
    const qty = perPerson ? o.people * o.days * (isBreak ? o.breaksPerDay : 1) : o.days;
    return { label: t.label, detail: t.detail, unitFcfa: t.fcfa, qty };
  });
}

// ---------- Créneaux ----------

export type SlotLike = { spaceId: number; date: string; start: string; end: string };

// Même règle que la base : même salle, même jour, et les plages se recouvrent (la fin peut coïncider avec le début suivant).
export const slotsConflict = (a: SlotLike, b: SlotLike): boolean =>
  a.spaceId === b.spaceId && a.date === b.date && a.start < b.end && b.start < a.end;

// ---------- Saisies ----------

export type SpaceInput = { name: string; capacity: number | null };
export function cleanSpace(b: Record<string, unknown>): Clean<SpaceInput> {
  const name = str(b.name, 80);
  if (!name) return { ok: false, error: 'Nom de la salle obligatoire (80 caractères maximum).' };
  let capacity: number | null = null;
  if (b.capacity !== undefined && b.capacity !== null && b.capacity !== '') {
    capacity = int(b.capacity);
    if (capacity === null || capacity < 1 || capacity > 1000) return { ok: false, error: 'Capacité : 1 à 1000 personnes.' };
  }
  return { ok: true, value: { name, capacity } };
}

export type EventInput = {
  title: string; clientName: string; contactName: string; contactPhone: string; contactEmail: string; attendees: number;
  optionUntil: string | null; notes: string; layout: string; equipment: string; breaksNote: string; mealsNote: string; quoteNote: string;
};

export function cleanEvent(b: Record<string, unknown>): Clean<EventInput> {
  const title = str(b.title, 120);
  if (!title) return { ok: false, error: 'Intitulé obligatoire (120 caractères maximum).' };
  const clientName = str(b.clientName, 120);
  if (!clientName) return { ok: false, error: 'Nom du client ou de la société obligatoire (120 caractères maximum).' };
  const contactName = str(b.contactName, 120);
  const contactPhone = str(b.contactPhone, 40);
  const contactEmail = str(b.contactEmail, 120);
  if (contactName === null || contactPhone === null || contactEmail === null) return { ok: false, error: 'Coordonnées du contact trop longues.' };
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return { ok: false, error: 'Adresse e-mail du contact illisible.' };
  const attendees = b.attendees === undefined || b.attendees === '' ? 1 : int(b.attendees);
  if (attendees === null || attendees < 1 || attendees > 1000) return { ok: false, error: 'Nombre de participants : 1 à 1000.' };
  let optionUntil: string | null = null;
  if (typeof b.optionUntil === 'string' && b.optionUntil.trim() !== '') {
    optionUntil = parseDate(b.optionUntil);
    if (!optionUntil) return { ok: false, error: 'Date de fin d’option illisible.' };
  }
  const notes = str(b.notes, 1000);
  const layout = str(b.layout, 500);
  const equipment = str(b.equipment, 500);
  const breaksNote = str(b.breaksNote, 500);
  const mealsNote = str(b.mealsNote, 500);
  const quoteNote = str(b.quoteNote, 500);
  if ([notes, layout, equipment, breaksNote, mealsNote, quoteNote].some((x) => x === null)) return { ok: false, error: 'Un des textes est trop long.' };
  return {
    ok: true,
    value: {
      title, clientName, contactName: contactName!, contactPhone: contactPhone!, contactEmail: contactEmail!, attendees, optionUntil,
      notes: notes!, layout: layout!, equipment: equipment!, breaksNote: breaksNote!, mealsNote: mealsNote!, quoteNote: quoteNote!,
    },
  };
}

export type SlotInput = { spaceId: number; date: string; start: string; end: string; label: string };
export function cleanSlot(b: Record<string, unknown>): Clean<SlotInput> {
  const spaceId = int(b.spaceId);
  if (spaceId === null || spaceId <= 0) return { ok: false, error: 'Salle inconnue.' };
  const date = parseDate(typeof b.date === 'string' ? b.date : '');
  if (!date) return { ok: false, error: 'Date du créneau obligatoire.' };
  const start = parseTime(typeof b.start === 'string' ? b.start : '');
  const end = parseTime(typeof b.end === 'string' ? b.end : '');
  if (!start || !end) return { ok: false, error: 'Heures de début et de fin obligatoires (format 09:00).' };
  if (end <= start) return { ok: false, error: 'La fin doit être après le début.' };
  const label = str(b.label, 120);
  if (label === null) return { ok: false, error: 'Libellé trop long.' };
  return { ok: true, value: { spaceId, date, start, end, label } };
}

export function cleanLine(b: Record<string, unknown>): Clean<QuoteLine> {
  const label = str(b.label, 120);
  if (!label) return { ok: false, error: 'Libellé de la ligne obligatoire (120 caractères maximum).' };
  const detail = str(b.detail, 200);
  if (detail === null) return { ok: false, error: 'Précision trop longue.' };
  const unitFcfa = int(b.unitFcfa);
  if (unitFcfa === null || unitFcfa < 0 || unitFcfa > 1_000_000_000) return { ok: false, error: 'Prix unitaire : nombre entier de FCFA, positif.' };
  const qty = b.qty === undefined || b.qty === '' ? 1 : int(b.qty);
  if (qty === null || qty < 0 || qty > 100_000) return { ok: false, error: 'Quantité : entier de 0 à 100 000.' };
  return { ok: true, value: { label, detail, unitFcfa, qty } };
}

export type BlockInput = { roomTypeId: number | null; rooms: number; arrival: string; departure: string; note: string };
export function cleanBlock(b: Record<string, unknown>): Clean<BlockInput> {
  let roomTypeId: number | null = null;
  if (b.roomTypeId !== undefined && b.roomTypeId !== null && b.roomTypeId !== '') {
    roomTypeId = int(b.roomTypeId);
    if (roomTypeId === null || roomTypeId <= 0) return { ok: false, error: 'Type de chambre inconnu.' };
  }
  const rooms = int(b.rooms);
  if (rooms === null || rooms < 1 || rooms > 100) return { ok: false, error: 'Nombre de chambres : 1 à 100.' };
  const arrival = parseDate(typeof b.arrival === 'string' ? b.arrival : '');
  const departure = parseDate(typeof b.departure === 'string' ? b.departure : '');
  if (!arrival || !departure) return { ok: false, error: 'Dates d’arrivée et de départ obligatoires.' };
  if (departure <= arrival) return { ok: false, error: 'Le départ doit être après l’arrivée.' };
  const note = str(b.note, 200);
  if (note === null) return { ok: false, error: 'Remarque trop longue.' };
  return { ok: true, value: { roomTypeId, rooms, arrival, departure, note } };
}

export type AttendeeInput = { name: string; company: string; diet: string };
export function cleanAttendee(b: Record<string, unknown>): Clean<AttendeeInput> {
  const name = str(b.name, 120);
  if (!name) return { ok: false, error: 'Nom du participant obligatoire (120 caractères maximum).' };
  const company = str(b.company, 120);
  const diet = str(b.diet, 120);
  if (company === null || diet === null) return { ok: false, error: 'Société ou régime trop longs.' };
  return { ok: true, value: { name, company, diet } };
}

// Une liste de participants collée depuis un tableur : un par ligne, « Nom ; Société ; Régime » (séparateurs ; ou tabulation).
export function parseAttendees(text: string): Clean<AttendeeInput[]> {
  const out: AttendeeInput[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const [name = '', company = '', diet = ''] = raw.split(/[;\t]/).map((s) => s.trim());
    const c = cleanAttendee({ name, company, diet });
    if (!c.ok) return { ok: false, error: `${c.error} (ligne : ${raw.slice(0, 40)})` };
    out.push(c.value);
  }
  if (out.length > 500) return { ok: false, error: '500 participants au maximum par import.' };
  return { ok: true, value: out };
}

// Numéro de dossier : « GRP-2026-0007 ».
export const eventReference = (year: number, n: number): string => `GRP-${year}-${String(n).padStart(4, '0')}`;
