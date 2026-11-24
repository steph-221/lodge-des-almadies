import { api } from '../api';
import { h } from '../dom';

type Night = { date: string; rooms: number; guests: number };
type Delay = { key: string; total: number; done: number; open: number; cancelled: number; avgStartMin: number | null; avgDoneMin: number | null; medianDoneMin: number | null };
type Use = { itemId: number; name: string; kind: string; unit: string; used: number; lost: number };
type Report = {
  from: string; to: string;
  occupancy: { nights: Night[]; roomNights: number; guestNights: number; availableRoomNights: number; rate: number; avgStay: number; stays: number; peak: Night | null };
  requests: Delay[]; issues: Delay[]; use: Use[];
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const msg = $('r-msg'), out = $('r-out');
const day = (s: string) => s.split('-').reverse().join('/');
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const SERVICE: Record<string, string> = { reception: 'Réception', housekeeping: 'Ménage', technique: 'Technique', restaurant: 'Restaurant' };
const PRIORITY: Record<string, string> = { urgent: 'Urgente', high: 'Haute', normal: 'Normale', low: 'Basse' };
const KIND: Record<string, string> = { linen: 'Linge', supply: 'Consommable', minibar: 'Minibar' };

function fmtMin(m: number | null): string {
  if (m === null) return '—';
  if (m < 60) return `${m} min`;
  const hh = Math.floor(m / 60), r = m % 60;
  if (hh >= 48) return `${Math.round(hh / 24)} j`;
  return r ? `${hh} h ${String(r).padStart(2, '0')}` : `${hh} h`;
}

const stat = (label: string, value: string) => h('div', { class: 'card', style: 'flex:1 1 130px;margin:0' }, [h('div', { class: 'hint' }, label), h('div', { style: 'font-size:1.5rem;font-weight:600' }, value)]);

function table(head: string[], rows: (string | number)[][]): HTMLElement {
  return h('div', { class: 'table-wrap' }, h('table', {}, [
    h('thead', {}, h('tr', {}, head.map((x) => h('th', {}, x)))),
    h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c) => h('td', {}, String(c)))))),
  ]));
}

const delayTable = (label: string, rows: Delay[], name: (k: string) => string) =>
  rows.length
    ? table([label, 'Faites', 'Prise en charge', 'Réalisation'],
      rows.map((r) => [
        name(r.key),
        `${r.done} / ${r.total}` + (r.open || r.cancelled ? ` (${[r.open ? `${r.open} ouv.` : '', r.cancelled ? `${r.cancelled} ann.` : ''].filter(Boolean).join(', ')})` : ''),
        fmtMin(r.avgStartMin),
        r.avgDoneMin === null ? '—' : `${fmtMin(r.avgDoneMin)} (méd. ${fmtMin(r.medianDoneMin)})`,
      ]))
    : h('p', { class: 'hint' }, 'Aucune entrée sur la période.');

function bars(nights: Night[], max: number): HTMLElement {
  // Une barre par nuit ; au-delà de 60 nuits, on garde la lecture par le tableau de synthèse.
  const box = h('div', { style: 'display:flex;align-items:flex-end;gap:2px;height:90px;border-bottom:1px solid currentColor;overflow:hidden', role: 'img', 'aria-label': 'Chambres occupées par nuit' });
  for (const n of nights) {
    box.appendChild(h('div', { title: `${day(n.date)} : ${n.rooms} chambre(s), ${n.guests} personne(s)`, style: `flex:1 1 0;min-width:2px;background:currentColor;opacity:.55;height:${max ? Math.max(2, Math.round((n.rooms / max) * 100)) : 2}%` }));
  }
  return box;
}

function render(r: Report) {
  out.textContent = '';
  const o = r.occupancy;
  out.appendChild(h('h3', {}, `Occupation du ${day(r.from)} au ${day(r.to)}`));
  out.appendChild(h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px' }, [
    stat('Taux d’occupation', `${String(o.rate).replace('.', ',')} %`),
    stat('Nuitées chambres', `${o.roomNights} / ${o.availableRoomNights}`),
    stat('Nuitées personnes', String(o.guestNights)),
    stat('Séjours', String(o.stays)),
    stat('Durée moyenne', `${String(o.avgStay).replace('.', ',')} nuit(s)`),
    stat('Nuit la plus chargée', o.peak ? `${day(o.peak.date)} · ${o.peak.rooms}` : '—'),
  ]));
  if (o.nights.length > 1) out.appendChild(h('div', { class: 'card' }, [h('div', { class: 'hint' }, 'Chambres occupées par nuit (survolez une barre)'), bars(o.nights, Math.max(...o.nights.map((n) => n.rooms)))]));

  out.appendChild(h('h3', {}, 'Demandes clients, par service'));
  out.appendChild(h('p', { class: 'hint' }, 'Délais moyens depuis la création : prise en charge = passage « en cours », réalisation = terminée. ouv. = ouvertes, ann. = annulées.'));
  out.appendChild(delayTable('Service', r.requests, (k) => SERVICE[k] ?? k));
  out.appendChild(h('h3', {}, 'Pannes, par priorité'));
  out.appendChild(delayTable('Priorité', r.issues, (k) => PRIORITY[k] ?? k));
  out.appendChild(h('h3', {}, 'Consommation d’articles'));
  out.appendChild(r.use.length
    ? table(['Article', 'Nature', 'Consommé', 'Perdu'], r.use.map((u) => [u.name, KIND[u.kind] ?? u.kind, `${u.used} ${u.unit}`, u.lost ? `${u.lost} ${u.unit}` : '—']))
    : h('p', { class: 'hint' }, 'Aucun mouvement de stock sur la période.'));
}

async function load() {
  const from = $<HTMLInputElement>('r-from').value, to = $<HTMLInputElement>('r-to').value;
  msg.textContent = 'Calcul en cours…'; msg.className = 'hint';
  const r = await api<{ report: Report }>('GET', `/api/hotel/reports?from=${from}&to=${to}`);
  if (!r.ok) { msg.textContent = r.data.error || 'Lecture impossible.'; msg.className = 'err'; return; }
  msg.textContent = ''; render(r.data.report);
}

function setDays(n: number) {
  const end = new Date(); // Dakar est en UTC toute l'année
  $<HTMLInputElement>('r-to').value = iso(end.getTime());
  $<HTMLInputElement>('r-from').value = iso(end.getTime() - (n - 1) * 86_400_000);
}

$('r-form').addEventListener('submit', (e) => { e.preventDefault(); void load(); });
document.querySelectorAll<HTMLButtonElement>('[data-days]').forEach((b) => b.addEventListener('click', () => { setDays(Number(b.dataset.days)); void load(); }));
setDays(30);
void load();
