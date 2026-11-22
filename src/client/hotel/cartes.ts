import { api } from '../api';
import { h } from '../dom';

type Card = { id: number; code: string; kind: 'client' | 'passe' | 'personnel'; roomNumber: string | null; holder: string; status: 'active' | 'lost' | 'retired'; statusNote: string; statusAt: string | null };
type Item = { id: number; foundOn: string; roomNumber: string | null; place: string; description: string; storage: string; status: 'stored' | 'returned' | 'discarded'; returnedTo: string; foundBy: string | null };

const root = document.getElementById('keys-app')!;
const editor = root.dataset.editor === '1';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const msg = $('k-msg');
const flash = (text: string, ok = false) => { msg.textContent = text; msg.className = ok ? 'ok' : 'err'; };
const KIND = { client: 'Carte client', passe: 'Passe', personnel: 'Personnel' } as const;
const CSTATUS = { active: 'Active', lost: 'Perdue', retired: 'Retirée' } as const;
const ISTATUS = { stored: 'Gardé', returned: 'Rendu', discarded: 'Éliminé' } as const;
const dayFmt = (s: string) => s.split('-').reverse().join('/');

async function loadRooms() {
  const r = await api<{ rooms: { id: number; number: string; active: boolean }[] }>('GET', '/api/hotel/rooms');
  const fill = (id: string) => {
    const sel = document.getElementById(id) as HTMLSelectElement | null;
    if (!sel) return;
    sel.textContent = '';
    sel.appendChild(h('option', { value: '' }, '— aucune —'));
    if (r.ok) for (const x of r.data.rooms.filter((y) => y.active)) sel.appendChild(h('option', { value: String(x.id) }, x.number));
  };
  fill('kc-room'); fill('ki-room');
}

async function loadCards() {
  if (!editor) return;
  const f = $<HTMLSelectElement>('kc-filter').value;
  const r = await api<{ cards: Card[] }>('GET', `/api/hotel/cards?status=${f}`);
  const box = $('kc-list');
  box.textContent = '';
  if (!r.ok) { flash(r.data.error || 'Lecture impossible.'); return; }
  if (!r.data.cards.length) { box.appendChild(h('p', { class: 'hint' }, 'Aucune carte dans cette liste.')); return; }
  const tbody = h('tbody', {});
  for (const c of r.data.cards) {
    const acts = h('td', { class: 'acts' });
    if (c.status === 'active') {
      acts.appendChild(h('button', { class: 'sm', type: 'button', onclick: () => void changeCard(c, 'lost') }, 'Déclarer perdue'));
      acts.appendChild(h('button', { class: 'sm', type: 'button', onclick: () => void changeCard(c, 'retired') }, 'Retirer'));
    }
    tbody.appendChild(h('tr', { style: c.status === 'lost' ? 'color:var(--err,#b00020)' : c.status === 'retired' ? 'opacity:.6' : '' },
      h('td', {}, h('strong', {}, c.code), h('div', { class: 'hint' }, [KIND[c.kind], c.holder].filter(Boolean).join(' · '))),
      h('td', {}, c.roomNumber ?? '—'),
      h('td', {}, CSTATUS[c.status], c.statusNote ? h('div', { class: 'hint' }, c.statusNote) : null), acts));
  }
  box.appendChild(h('table', { class: 'tbl' },
    h('thead', {}, h('tr', {}, ...['Carte', 'Chambre', 'État', ''].map((t) => h('th', {}, t)))), tbody));
}

async function changeCard(c: Card, status: 'lost' | 'retired') {
  const lost = status === 'lost';
  const note = prompt(lost ? `Carte ${c.code} perdue : où et quand ? (facultatif)` : `Retirer la carte ${c.code} (rendue, détruite…) : remarque facultative`);
  if (note === null) return;
  const r = await api<{ alerted?: boolean }>('PATCH', `/api/hotel/cards/${c.id}`, { status, note });
  if (!r.ok) { flash(r.data.error || 'Action impossible.'); await loadCards(); return; }
  flash(lost ? `Carte ${c.code} déclarée perdue et sortie du registre actif.${r.data.alerted ? ' L’équipe est prévenue dans le cahier de liaison : faites désactiver la carte sur la serrure.' : ' Pensez à prévenir l’équipe et à faire désactiver la carte sur la serrure.'}` : `Carte ${c.code} retirée.`, true);
  await loadCards();
}

async function loadItems() {
  if (!editor) return;
  const f = $<HTMLSelectElement>('ki-filter').value;
  const r = await api<{ items: Item[] }>('GET', `/api/hotel/lost?status=${f}`);
  const box = $('ki-list');
  box.textContent = '';
  if (!r.ok) { flash(r.data.error || 'Lecture impossible.'); return; }
  if (!r.data.items.length) { box.appendChild(h('p', { class: 'hint' }, 'Aucun objet dans cette liste.')); return; }
  const tbody = h('tbody', {});
  for (const i of r.data.items) {
    const where = [i.roomNumber ? `chambre ${i.roomNumber}` : '', i.place].filter(Boolean).join(' · ') || '—';
    const acts = h('td', { class: 'acts' });
    if (i.status === 'stored') {
      acts.appendChild(h('button', { class: 'sm', type: 'button', onclick: () => void closeItem(i, 'returned') }, 'Rendu'));
      acts.appendChild(h('button', { class: 'sm', type: 'button', onclick: () => void closeItem(i, 'discarded') }, 'Éliminé'));
    }
    tbody.appendChild(h('tr', {},
      h('td', {}, h('strong', {}, i.description),
        h('div', { class: 'hint' }, [dayFmt(i.foundOn), where !== '—' ? where : '', i.foundBy ? `par ${i.foundBy}` : ''].filter(Boolean).join(' · ')),
        i.storage ? h('div', { class: 'hint' }, `Rangé : ${i.storage}`) : null),
      h('td', {}, ISTATUS[i.status], i.returnedTo ? h('div', { class: 'hint' }, `à ${i.returnedTo}`) : null), acts));
  }
  box.appendChild(h('table', { class: 'tbl' },
    h('thead', {}, h('tr', {}, ...['Objet', 'État', ''].map((t) => h('th', {}, t)))), tbody));
}

async function closeItem(i: Item, status: 'returned' | 'discarded') {
  let returnedTo = '';
  if (status === 'returned') {
    const n = prompt(`« ${i.description} » rendu à qui ?`);
    if (n === null) return;
    returnedTo = n;
  } else if (!confirm(`Éliminer « ${i.description} » ? Cette action est définitive.`)) return;
  const r = await api('PATCH', `/api/hotel/lost/${i.id}`, { status, returnedTo });
  if (!r.ok) flash(r.data.error || 'Action impossible.'); else flash(status === 'returned' ? 'Objet rendu.' : 'Objet éliminé.', true);
  await loadItems();
}

const val = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)?.value ?? '';

if (editor) {
  $<HTMLFormElement>('k-card-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await api('POST', '/api/hotel/cards', { code: val('kc-code'), kind: val('kc-kind'), roomId: val('kc-room'), holder: val('kc-holder') });
    if (!r.ok) { flash(r.data.error || 'Ajout impossible.'); return; }
    flash('Carte ajoutée.', true);
    $<HTMLFormElement>('k-card-form').reset();
    await loadCards();
  });
  $('kc-filter').addEventListener('change', () => void loadCards());
  $('ki-filter').addEventListener('change', () => void loadItems());
}
$<HTMLFormElement>('k-item-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await api('POST', '/api/hotel/lost', { description: val('ki-desc'), roomId: val('ki-room'), place: val('ki-place'), storage: val('ki-storage') });
  if (!r.ok) { flash(r.data.error || 'Enregistrement impossible.'); return; }
  flash(editor ? 'Objet enregistré.' : 'Merci, l’objet est signalé à la réception.', true);
  $<HTMLFormElement>('k-item-form').reset();
  await loadItems();
});

void loadRooms();
void loadCards();
void loadItems();
