// Rapports : occupation, délais de traitement, consommation. Logique pure, testée, sans base ni réseau.
// Jamais de nom de client : ce sont des chiffres.
import type { Clean } from './validate';

export const MAX_DAYS = 366;
const DAY = 86_400_000;
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);
const ts = (d: string) => Date.parse(`${d}T00:00:00Z`);
const validDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && isoDay(ts(v)) === v;

/** Période demandée (jours inclus). Par défaut : les 30 derniers jours jusqu'à aujourd'hui. */
export function cleanPeriod(from: unknown, to: unknown, today: string): Clean<{ from: string; to: string }> {
  const end = to == null || to === '' ? today : to;
  if (!validDay(end)) return { ok: false, error: 'Date de fin invalide.' };
  const start = from == null || from === '' ? isoDay(ts(end) - 29 * DAY) : from;
  if (!validDay(start)) return { ok: false, error: 'Date de début invalide.' };
  if (start > end) return { ok: false, error: 'La date de début doit précéder la date de fin.' };
  if ((ts(end) - ts(start)) / DAY + 1 > MAX_DAYS) return { ok: false, error: `Période trop longue (${MAX_DAYS} jours au plus).` };
  return { ok: true, value: { from: start, to: end } };
}

// ---------- Occupation ----------

export type StayLite = { guests: number; arrival: string; departure: string };
export type NightCount = { date: string; rooms: number; guests: number };
export type Occupancy = {
  nights: NightCount[]; roomNights: number; guestNights: number; availableRoomNights: number;
  rate: number; // pourcentage d'occupation, une décimale
  avgStay: number; // durée moyenne des séjours qui touchent la période, en nuits (une décimale)
  stays: number; peak: NightCount | null;
};

/** Nuit « d » occupée par un séjour si arrivée ≤ d < départ (le jour du départ n'est pas une nuit). */
export function occupancy(stays: StayLite[], roomCount: number, from: string, to: string): Occupancy {
  const nights: NightCount[] = [];
  for (let t = ts(from); t <= ts(to); t += DAY) {
    const d = isoDay(t);
    const here = stays.filter((s) => s.arrival <= d && s.departure > d);
    nights.push({ date: d, rooms: here.length, guests: here.reduce((n, s) => n + s.guests, 0) });
  }
  const roomNights = nights.reduce((n, x) => n + x.rooms, 0);
  const guestNights = nights.reduce((n, x) => n + x.guests, 0);
  const available = Math.max(0, roomCount) * nights.length;
  const touching = stays.filter((s) => s.arrival <= to && s.departure > from);
  const length = touching.reduce((n, s) => n + (ts(s.departure) - ts(s.arrival)) / DAY, 0);
  const peak = nights.reduce<NightCount | null>((p, x) => (!p || x.rooms > p.rooms ? x : p), null);
  return {
    nights, roomNights, guestNights, availableRoomNights: available,
    rate: available ? Math.round((roomNights / available) * 1000) / 10 : 0,
    avgStay: touching.length ? Math.round((length / touching.length) * 10) / 10 : 0,
    stays: touching.length, peak,
  };
}

// ---------- Délais de traitement ----------

export type DelayRow = { key: string; status: string; startMin: number | null; doneMin: number | null };
export type DelayStat = { key: string; total: number; done: number; open: number; cancelled: number; avgStartMin: number | null; avgDoneMin: number | null; medianDoneMin: number | null };

const avg = (v: number[]) => (v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null);
const median = (v: number[]) => {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
};

/** Délais en minutes, par catégorie (service, priorité…). Les valeurs négatives ou absurdes (horloge) sont écartées. */
export function delayStats(rows: DelayRow[]): DelayStat[] {
  const keys = [...new Set(rows.map((r) => r.key))].sort((a, b) => a.localeCompare(b, 'fr'));
  const ok = (n: number | null): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
  return keys.map((key) => {
    const mine = rows.filter((r) => r.key === key);
    const done = mine.filter((r) => r.status === 'done');
    return {
      key, total: mine.length, done: done.length,
      open: mine.filter((r) => r.status === 'new' || r.status === 'doing' || r.status === 'open').length,
      cancelled: mine.filter((r) => r.status === 'cancelled').length,
      avgStartMin: avg(mine.map((r) => r.startMin).filter(ok)),
      avgDoneMin: avg(done.map((r) => r.doneMin).filter(ok)),
      medianDoneMin: median(done.map((r) => r.doneMin).filter(ok)),
    };
  });
}

/** 95 min → « 1 h 35 » ; moins d'une heure → « 12 min » ; absent → « — ». */
export function fmtMinutes(m: number | null): string {
  if (m === null) return '—';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  if (h >= 48) return `${Math.round(h / 24)} j`;
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`;
}

// ---------- Consommation ----------

export type UseRow = { itemId: number; name: string; kind: string; unit: string; used: number; lost: number };
/** Articles triés du plus consommé au moins consommé ; les lignes sans mouvement disparaissent. */
export const topUse = (rows: UseRow[]): UseRow[] =>
  rows.filter((r) => r.used > 0 || r.lost > 0).sort((a, b) => b.used - a.used || b.lost - a.lost || a.name.localeCompare(b.name, 'fr'));
