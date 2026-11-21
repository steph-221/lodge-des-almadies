// Brief du jour : synthèse des séjours, destinataires, cahier de liaison, texte de l'e-mail. Logique pure, testée.
import type { Clean } from './validate';

const natural = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true });

export type DayStay = { roomNumber: string; guestName: string; guests: number; arrival: string; departure: string };

export type StaySummary = {
  arrivals: DayStay[]; departures: DayStay[]; stayovers: DayStay[];
  occupiedTonight: number; guestsTonight: number; breakfasts: number;
};

/**
 * Jours hôteliers aaaa-mm-jj ; le jour de départ n'est pas une nuit.
 * Occupée cette nuit : arrivée ≤ jour < départ. Petits-déjeuners : clients qui ont dormi la nuit précédente (arrivée < jour ≤ départ).
 */
export function summarizeStays(date: string, stays: DayStay[]): StaySummary {
  const sort = (l: DayStay[]) => l.sort((a, b) => natural(a.roomNumber, b.roomNumber));
  const arrivals = sort(stays.filter((s) => s.arrival === date));
  const departures = sort(stays.filter((s) => s.departure === date));
  const stayovers = sort(stays.filter((s) => s.arrival < date && s.departure > date));
  const tonight = stays.filter((s) => s.arrival <= date && s.departure > date);
  const breakfasts = stays.filter((s) => s.arrival < date && s.departure >= date).reduce((n, s) => n + s.guests, 0);
  return { arrivals, departures, stayovers, occupiedTonight: tonight.length, guestsTonight: tonight.reduce((n, s) => n + s.guests, 0), breakfasts };
}

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;

export function parseRecipients(text: string): Clean<string[]> {
  const parts = text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (!EMAIL.test(p) || p.length > 120) return { ok: false, error: `Adresse invalide : ${p.slice(0, 60)}` };
    const k = p.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(k); }
  }
  if (out.length > 20) return { ok: false, error: '20 destinataires au maximum.' };
  return { ok: true, value: out };
}

export function cleanLogEntry(b: Record<string, unknown>): Clean<{ body: string }> {
  if (typeof b.body !== 'string') return { ok: false, error: 'Écrivez un message.' };
  const body = b.body.trim();
  if (!body) return { ok: false, error: 'Écrivez un message.' };
  if (body.length > 1000) return { ok: false, error: 'Message trop long (1000 caractères maximum).' };
  return { ok: true, value: { body } };
}

export type BriefData = {
  date: string; arrivals: number; departures: number; stayovers: number; occupiedTonight: number; guestsTonight: number; breakfasts: number;
  tasks: { todo: number; doing: number; done: number; checked: number };
  outOfService: string[]; linenShort: string[]; defects: { housekeeping: number; maintenance: number }; openExtras: number;
};

const fmt = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// E-mail du matin : des chiffres seulement, jamais de nom de client.
export function briefEmail(d: BriefData, origin: string): { subject: string; text: string; html: string } {
  const lines: [string, string][] = [
    ['Arrivées', String(d.arrivals)], ['Départs', String(d.departures)], ['Recouches', String(d.stayovers)],
    ['Chambres occupées cette nuit', `${d.occupiedTonight} (${d.guestsTonight} personnes)`],
    ['Petits-déjeuners à prévoir', String(d.breakfasts)],
    ['Ménage', `${d.tasks.todo} à faire, ${d.tasks.doing} en cours, ${d.tasks.done} à contrôler, ${d.tasks.checked} contrôlée(s)`],
    ['Chambres hors service', d.outOfService.length ? d.outOfService.join(', ') : 'aucune'],
    ['Défauts à corriger', `${d.defects.housekeeping} ménage, ${d.defects.maintenance} technique`],
    ['Extras à reporter', `${d.openExtras.toLocaleString('fr-FR')} FCFA`],
  ];
  const text = [`Brief du ${fmt(d.date)}`, '', ...lines.map(([k, v]) => `${k} : ${v}`),
    ...(d.linenShort.length ? ['', 'Linge à surveiller :', ...d.linenShort.map((l) => `- ${l}`)] : []),
    '', `Détail : ${origin ? origin + '/admin/hotel/' : '/admin/hotel/'}`].join('\n');
  const rows = lines.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#555">${esc(k)}</td><td style="padding:4px 0"><strong>${esc(v)}</strong></td></tr>`).join('');
  const linen = d.linenShort.length ? `<p><strong>Linge à surveiller</strong></p><ul>${d.linenShort.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '';
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222"><h2 style="margin:0 0 12px">Brief du ${fmt(d.date)}</h2><table>${rows}</table>${linen}<p><a href="${esc(origin)}/admin/hotel/">Ouvrir l’espace Services hôtel</a></p></div>`;
  return { subject: `Brief du ${fmt(d.date)} — Lodge des Almadies`, text, html };
}
