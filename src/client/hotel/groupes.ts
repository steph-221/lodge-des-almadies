import { api } from '../api';
import { h } from '../dom';

type Status = 'request' | 'option' | 'quoted' | 'confirmed' | 'done' | 'cancelled';
type Ev = { id: number; reference: string; title: string; clientName: string; status: Status; attendees: number; firstDate: string | null; lastDate: string | null; total: number };
type Slot = { id: number; eventId: number; reference: string; title: string; status: Status; spaceName: string; date: string; start: string; end: string; label: string; blocking: boolean };
type Space = { id: number; name: string; capacity: number | null; active: boolean };

const STATUS: Record<Status, string> = { request: 'Demande', option: 'Option', quoted: 'Devis envoyé', confirmed: 'Confirmé', done: 'Terminé', cancelled: 'Annulé' };
const root = document.getElementById('ev-app')!;
const manage = root.dataset.manage === '1';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const msg = $('ev-msg');
const flash = (text: string, ok = false) => { msg.textContent = text; msg.className = ok ? 'ok' : 'err'; };
const fmtDate = (d: string) => d.split('-').reverse().join('/');
const fcfa = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
const today = new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);

const pill = (s: Status) => h('span', { class: s === 'confirmed' || s === 'done' ? 'pill' : 'pill off' }, STATUS[s]);

async function loadEvents() {
  const f = $<HTMLSelectElement>('ev-filter').value;
  const q = f === 'active' ? '?status=request,option,quoted,confirmed' : f ? `?status=${f}` : '';
  const r = await api<{ events: Ev[] }>('GET', `/api/hotel/events${q}`);
  const body = $('ev-body');
  if (!r.ok) { flash(r.data.error || 'Lecture impossible.'); return; }
  body.textContent = '';
  const cols = manage ? 7 : 5;
  if (!r.data.events.length) body.appendChild(h('tr', {}, h('td', { colspan: String(cols), class: 'hint' }, 'Aucun dossier.')));
  for (const e of r.data.events) {
    const dates = e.firstDate ? (e.firstDate === e.lastDate ? fmtDate(e.firstDate) : `${fmtDate(e.firstDate)} → ${fmtDate(e.lastDate!)}`) : 'à planifier';
    body.appendChild(h('tr', {},
      h('td', {}, h('a', { href: `/admin/hotel/groupes/dossier/?id=${e.id}` }, e.reference)),
      h('td', {}, e.title),
      manage ? h('td', {}, e.clientName) : null,
      h('td', {}, dates), h('td', {}, String(e.attendees)), h('td', {}, pill(e.status)),
      manage ? h('td', {}, e.total ? fcfa(e.total) : '—') : null));
  }
}

async function loadCalendar() {
  const from = $<HTMLInputElement>('cal-from').value, to = $<HTMLInputElement>('cal-to').value;
  if (!from || !to) return;
  const r = await api<{ slots: Slot[] }>('GET', `/api/hotel/events?view=calendar&from=${from}&to=${to}`);
  const body = $('cal-body');
  if (!r.ok) { flash(r.data.error || 'Lecture impossible.'); return; }
  body.textContent = '';
  if (!r.data.slots.length) body.appendChild(h('tr', {}, h('td', { colspan: '5', class: 'hint' }, 'Aucun créneau sur cette période.')));
  for (const s of r.data.slots) {
    body.appendChild(h('tr', {},
      h('td', {}, fmtDate(s.date)), h('td', {}, `${s.start} – ${s.end}${s.label ? ` · ${s.label}` : ''}`), h('td', {}, s.spaceName),
      h('td', {}, h('a', { href: `/admin/hotel/groupes/dossier/?id=${s.eventId}` }, `${s.reference} · ${s.title}`)),
      h('td', {}, pill(s.status), s.blocking ? null : h('span', { class: 'hint' }, ' (ne retient pas la salle)'))));
  }
}

async function loadSpaces() {
  if (!manage) return;
  const r = await api<{ spaces: Space[] }>('GET', '/api/hotel/spaces');
  const box = $('sp-list');
  if (!r.ok) { flash(r.data.error || 'Lecture impossible.'); return; }
  box.textContent = '';
  if (!r.data.spaces.length) box.appendChild(h('p', { class: 'hint' }, 'Aucune salle : ajoutez-en une avant de planifier un créneau.'));
  for (const s of r.data.spaces) {
    box.appendChild(h('div', { class: 'item' }, h('div', { class: 'head-row' },
      h('strong', {}, `${s.name}${s.capacity ? ` · ${s.capacity} pers.` : ''}`),
      h('div', { class: 'acts' }, s.active ? null : h('span', { class: 'pill off' }, 'Retirée'),
        h('button', { class: 'sm', type: 'button', onclick: async () => {
          const x = await api('PATCH', `/api/hotel/spaces/${s.id}`, { active: !s.active });
          if (!x.ok) flash(x.data.error || 'Enregistrement impossible.'); await loadSpaces();
        } }, s.active ? 'Retirer' : 'Remettre')))));
  }
}

$('ev-filter').addEventListener('change', () => void loadEvents());
$<HTMLInputElement>('cal-from').value = addDays(today, -7);
$<HTMLInputElement>('cal-to').value = addDays(today, 60);
$('cal-from').addEventListener('change', () => void loadCalendar());
$('cal-to').addEventListener('change', () => void loadCalendar());

if (manage) {
  const form = $<HTMLFormElement>('ev-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await api<{ event: { id: number } }>('POST', '/api/hotel/events', Object.fromEntries(new FormData(form)));
    if (!r.ok) { flash(r.data.error || 'Enregistrement impossible.'); return; }
    location.href = `/admin/hotel/groupes/dossier/?id=${r.data.event.id}`;
  });
  const sp = $<HTMLFormElement>('sp-form');
  sp.addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await api('POST', '/api/hotel/spaces', Object.fromEntries(new FormData(sp)));
    if (!r.ok) { flash(r.data.error || 'Enregistrement impossible.'); return; }
    flash('Salle ajoutée.', true); sp.reset(); await loadSpaces();
  });
}

void loadEvents(); void loadCalendar(); void loadSpaces();
