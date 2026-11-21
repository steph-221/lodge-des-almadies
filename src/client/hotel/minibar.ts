import { api } from '../api';
import { h } from '../dom';

type Line = { itemId: number; itemName: string; dotation: number; price: number };
type Room = { roomId: number; number: string; building: string; typeLabel: string | null; lastReading: string | null; lines: Line[] };
type Dot = { roomTypeId: number; roomTypeLabel: string; itemId: number; itemName: string; qty: number; price: number };
type Data = { rooms: Room[]; dotation: Dot[]; items: { id: number; name: string; price: number }[]; canConfigure: boolean };

const root = document.getElementById('minibar-app')!;
const canRead = root.dataset.reading === '1';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const msg = $('mb-msg');
const flash = (text: string, ok = false) => { msg.textContent = text; msg.className = ok ? 'ok' : 'err'; };
const fmtDt = (iso: string) => { const d = new Date(iso); return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };
const fcfa = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`;

function renderRooms(rooms: Room[]) {
  const box = $('mb-rooms');
  box.textContent = '';
  $('mb-count').textContent = `${rooms.length} chambre(s)`;
  if (!rooms.length) { box.appendChild(h('p', { class: 'hint' }, 'Aucune chambre avec minibar : cochez « Minibar » sur la fiche d’une chambre (onglet Chambres).')); return; }
  for (const r of rooms) {
    const meta = `${r.building ? r.building + ' · ' : ''}${r.typeLabel ?? 'type non défini'}${r.lastReading ? ` · dernier relevé ${fmtDt(r.lastReading)}` : ' · jamais relevé'}`;
    if (!r.lines.length) {
      box.appendChild(h('div', { class: 'item' }, h('strong', {}, `Chambre ${r.number}`), h('p', { class: 'hint' }, `${meta} — aucune dotation définie pour ce type de chambre.`)));
      continue;
    }
    const inputs = new Map<number, HTMLInputElement>();
    const body = h('div', { hidden: true },
      h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Article'), h('th', {}, 'Dotation'), h('th', {}, 'Compté (reste)'))),
        h('tbody', {}, r.lines.map((l) => {
          const inp = h('input', { type: 'number', min: '0', max: '99', value: String(l.dotation), style: 'width:6rem', inputmode: 'numeric' }) as HTMLInputElement;
          inputs.set(l.itemId, inp);
          return h('tr', {}, h('td', {}, l.itemName), h('td', {}, String(l.dotation)), h('td', {}, inp));
        })))),
      canRead && h('div', { class: 'acts' }, h('button', { class: 'btn', type: 'button', onclick: async () => {
        const counts = [...inputs].map(([itemId, el]) => ({ itemId, counted: Number(el.value) }));
        const d = await api<{ consumed?: { itemName: string; qty: number }[]; total?: number }>('POST', '/api/hotel/minibar', { roomId: r.roomId, counts });
        if (!d.ok) { flash(d.data.error || 'Relevé impossible.'); return; }
        const used = d.data.consumed ?? [];
        flash(used.length
          ? `Chambre ${r.number} : ${used.map((c) => `${c.qty} × ${c.itemName}`).join(', ')}${d.data.total ? ` — extra de ${fcfa(d.data.total)} créé` : ''}.`
          : `Chambre ${r.number} : rien consommé.`, true);
        await load();
      } }, 'Enregistrer le relevé')));
    const toggle = h('button', { class: 'sm', type: 'button', 'aria-expanded': 'false', onclick: () => {
      const open = body.hidden;
      body.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? 'Fermer' : 'Relever';
    } }, 'Relever');
    box.appendChild(h('div', { class: 'item' },
      h('div', { class: 'head-row' }, h('div', {}, h('strong', {}, `Chambre ${r.number}`), h('div', { class: 'hint' }, meta)), canRead ? toggle : null),
      body));
  }
}

function renderDotation(d: Data) {
  $('dot-card').hidden = !d.canConfigure;
  if (!d.canConfigure) return;
  const body = $('dot-body');
  body.textContent = '';
  if (!d.dotation.length) body.appendChild(h('tr', {}, h('td', { colspan: '5', class: 'hint' }, 'Aucune dotation définie.')));
  for (const l of d.dotation) {
    body.appendChild(h('tr', {}, h('td', {}, l.roomTypeLabel), h('td', {}, l.itemName), h('td', {}, String(l.qty)), h('td', {}, l.price ? fcfa(l.price) : 'non facturé'),
      h('td', {}, h('button', { class: 'sm danger', type: 'button', onclick: async () => {
        const r = await api('DELETE', '/api/hotel/minibar/dotation', { roomTypeId: l.roomTypeId, itemId: l.itemId });
        if (!r.ok) flash(r.data.error || 'Suppression impossible.'); else await load();
      } }, 'Retirer'))));
  }
  const sel = $<HTMLSelectElement>('dot-item');
  sel.textContent = '';
  sel.appendChild(h('option', { value: '' }, d.items.length ? 'Choisir…' : 'Créez d’abord des articles « Minibar » (onglet Linge & stocks)'));
  d.items.forEach((i) => sel.appendChild(h('option', { value: String(i.id) }, i.name)));
}

async function load() {
  const r = await api<Data>('GET', '/api/hotel/minibar');
  if (!r.ok) { flash(r.data.error || 'Lecture impossible.'); return; }
  renderRooms(r.data.rooms);
  renderDotation(r.data);
}

const form = document.getElementById('dot-form') as HTMLFormElement | null;
if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const r = await api('PUT', '/api/hotel/minibar/dotation', { roomTypeId: fd.get('roomTypeId'), itemId: fd.get('itemId'), qty: fd.get('qty') });
    if (!r.ok) { flash(r.data.error || 'Enregistrement impossible.'); return; }
    flash('Dotation enregistrée.', true);
    await load();
  });
  void api<{ types: { id: number; label: string }[] }>('GET', '/api/hotel/room-types').then((r) => {
    const sel = $<HTMLSelectElement>('dot-type');
    sel.appendChild(h('option', { value: '' }, 'Choisir…'));
    if (r.ok) r.data.types.forEach((t) => sel.appendChild(h('option', { value: String(t.id) }, t.label)));
  });
}

void load();
