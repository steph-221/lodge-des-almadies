import { api } from '../api';
import { h } from '../dom';

type Req = {
  id: number; roomNumber: string; label: string; qty: number; note: string; service: string; status: 'new' | 'doing' | 'done' | 'cancelled';
  source: 'guest' | 'staff'; lang: 'fr' | 'en'; price: number | null; createdAt: string; handledByName: string | null; charged: boolean;
};
type Cat = { id: number; labelFr: string; service: string; kind: string; askNote: boolean };

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const msg = $('rq-msg');
const flash = (text: string, ok = false) => { msg.textContent = text; msg.className = ok ? 'ok' : 'err'; };
const SERVICE: Record<string, string> = { reception: 'Réception', housekeeping: 'Ménage', technique: 'Technique', restaurant: 'Restaurant' };
const fcfa = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`;
const natural = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true });
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? 'à l’instant' : m < 60 ? `il y a ${m} min` : `il y a ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
};

// Son d'alerte : un bip court quand le nombre de nouvelles demandes augmente (réglage mémorisé, jamais bloquant).
const soundBox = $<HTMLInputElement>('rq-sound');
try { soundBox.checked = localStorage.getItem('rq-sound') === '1'; } catch { /* stockage indisponible */ }
let audio: AudioContext | null = null;
soundBox.addEventListener('change', () => {
  try { localStorage.setItem('rq-sound', soundBox.checked ? '1' : '0'); } catch { /* ignoré */ }
  if (soundBox.checked) beep(); // le premier bip, déclenché par un clic, débloque le son du navigateur
});
function beep() {
  try {
    audio ??= new AudioContext();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = 880;
    g.gain.value = 0.15;
    o.connect(g); g.connect(audio.destination);
    o.start(); o.stop(audio.currentTime + 0.25);
  } catch { /* pas de son possible */ }
}

let lastNew = -1;
let catalog: Cat[] = [];
let filled = false;

function fillForm(rooms: { id: number; number: string }[]) {
  if (filled) return;
  filled = true;
  const sel = $<HTMLSelectElement>('rq-room');
  sel.appendChild(h('option', { value: '' }, 'Choisir…'));
  rooms.forEach((r) => sel.appendChild(h('option', { value: String(r.id) }, r.number)));
  const cat = $<HTMLSelectElement>('rq-cat');
  cat.appendChild(h('option', { value: '' }, catalog.length ? 'Choisir…' : 'Aucune demande dans le catalogue'));
  catalog.forEach((c) => cat.appendChild(h('option', { value: String(c.id) }, `${c.labelFr} (${SERVICE[c.service] ?? c.service})`)));
}

async function act(id: number, status: string, okText: string) {
  const r = await api('PATCH', `/api/hotel/requests/${id}`, { status });
  if (!r.ok) flash(r.data.error || 'Enregistrement impossible.');
  else flash(okText + ((r.data as { charged?: boolean }).charged ? ' Extra créé dans l’onglet Extras.' : ''), true);
  await load();
}

function card(q: Req): HTMLElement {
  const open = q.status === 'new' || q.status === 'doing';
  return h('div', { class: 'item' },
    h('div', { class: 'head-row' },
      h('div', {},
        h('strong', {}, `Chambre ${q.roomNumber} · ${q.label}${q.qty > 1 ? ` ×${q.qty}` : ''}`),
        q.note ? h('div', {}, `« ${q.note} »`) : null,
        h('div', { class: 'hint' },
          `${ago(q.createdAt)} · ${SERVICE[q.service] ?? q.service} · ${q.source === 'guest' ? `client (${q.lang.toUpperCase()})` : 'saisie par le personnel'}`,
          q.price !== null ? ` · ${fcfa(q.price * q.qty)}` : '', q.handledByName ? ` · pris par ${q.handledByName}` : '', q.charged ? ' · extra créé' : '')),
      h('div', { class: 'acts' },
        q.status === 'new' ? h('button', { class: 'btn', type: 'button', onclick: () => act(q.id, 'doing', 'Demande prise en charge.') }, 'Prendre en charge') : null,
        open ? h('button', { class: 'btn', type: 'button', onclick: () => act(q.id, 'done', 'Demande terminée.') }, 'Fait') : null,
        open ? h('button', { class: 'sm danger', type: 'button', onclick: () => { if (confirm(`Annuler la demande « ${q.label} » (chambre ${q.roomNumber}) ?`)) void act(q.id, 'cancelled', 'Demande annulée.'); } }, 'Annuler') : null,
        !open ? h('span', { class: q.status === 'cancelled' ? 'pill off' : 'pill' }, q.status === 'done' ? 'Faite' : 'Annulée') : null)));
}

async function load() {
  const r = await api<{ requests: Req[]; rooms: { id: number; number: string }[]; catalog: Cat[] }>('GET', '/api/hotel/requests');
  const box = $('rq-list');
  if (!r.ok) { flash(r.data.error || 'Lecture impossible.'); return; }
  catalog = r.data.catalog;
  fillForm(r.data.rooms);
  const reqs = r.data.requests;
  const nNew = reqs.filter((q) => q.status === 'new').length;
  if (lastNew >= 0 && nNew > lastNew && soundBox.checked) beep();
  lastNew = nNew;
  document.title = (nNew ? `(${nNew}) ` : '') + document.title.replace(/^\(\d+\) /, '');
  box.textContent = '';
  const groups: [string, Req[]][] = [
    ['Nouvelles', reqs.filter((q) => q.status === 'new')],
    ['En cours', reqs.filter((q) => q.status === 'doing')],
    ['Terminées ou annulées (24 h)', reqs.filter((q) => q.status === 'done' || q.status === 'cancelled').reverse()],
  ];
  for (const [title, list] of groups) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || natural(a.roomNumber, b.roomNumber));
    box.appendChild(h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, `${title} (${list.length})`),
      list.length ? list.map(card) : h('p', { class: 'hint' }, 'Rien pour le moment.')));
  }
}

$<HTMLFormElement>('rq-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target as HTMLFormElement;
  const fd = new FormData(form);
  const r = await api('POST', '/api/hotel/requests', { roomId: fd.get('roomId'), catalogId: fd.get('catalogId'), qty: fd.get('qty'), note: fd.get('note') });
  if (!r.ok) { flash(r.data.error || 'Enregistrement impossible.'); return; }
  flash('Demande enregistrée.', true);
  form.reset();
  await load();
});

void load();
// Mise à jour automatique toutes les 25 s, en pause quand l'onglet est caché (économise la base).
setInterval(() => { if (!document.hidden) void load(); }, 25_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void load(); });
