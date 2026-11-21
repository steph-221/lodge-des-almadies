import { api } from '../api';
import { h } from '../dom';
import { ITEM_FIELDS } from '../../lib/hotel/items';
import { mountImport } from './import-ui';
import { KIND_LABEL } from './labels';

type Item = { id: number; name: string; kind: 'linen' | 'supply' | 'minibar'; unit: string; minStock: number; price: number; active: boolean; store: number; soiled: number; laundry: number; scrap: number };
type Need = { itemId: number; name: string; unit: string; qty: number; store: number; short: number };
type PrepRow = { id: number; roomTypeId: number | null; roomTypeLabel: string | null; kind: string; occupancy: number | null; cond: string | null; itemName: string; qty: number };
type Batch = { id: number; status: 'sent' | 'received'; sentAt: string; receivedAt: string | null; note: string; staffName: string | null; lines: { itemId: number; itemName: string; sent: number; received: number | null; damaged: number | null; missing: number | null }[] };

const root = document.getElementById('linen-app')!;
const manage = root.dataset.manage === '1';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const msg = $('linen-msg');
const flash = (text: string, ok = false) => { msg.textContent = text; msg.className = ok ? 'ok' : 'err'; };
const KIND = { linen: 'Linge', supply: 'Consommable', minibar: 'Minibar' } as const;
const COND: Record<string, string> = { extra_bed: 'Lit d’appoint', baby_cot: 'Lit bébé' };
const fmtDt = (iso: string) => { const d = new Date(iso); return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };

let items: Item[] = [];
let editing: Item | null = null;

// ---- À sortir ----
const dateInput = $<HTMLInputElement>('needs-date');
dateInput.value = new Date().toISOString().slice(0, 10);
async function loadNeeds() {
  const r = await api<{ tasks: number; needs: Need[] }>('GET', `/api/hotel/stock?date=${dateInput.value}`);
  const body = $('needs-body');
  body.textContent = '';
  if (!r.ok) { flash(r.data.error || 'Lecture impossible.'); return; }
  $('needs-sub').textContent = r.data.tasks
    ? `${r.data.tasks} chambre(s) à préparer ce jour-là (tâches non terminées).`
    : 'Aucune tâche à préparer ce jour-là : générez-les depuis l’onglet Chambres.';
  if (!r.data.needs.length) {
    body.appendChild(h('tr', {}, h('td', { colspan: '4', class: 'hint' }, r.data.tasks ? 'Aucun gabarit ne s’applique : définissez-les plus bas.' : '—')));
    return;
  }
  for (const n of r.data.needs) {
    body.appendChild(h('tr', {},
      h('td', {}, h('strong', {}, n.name)), h('td', {}, `${n.qty} ${n.unit}`), h('td', {}, String(n.store)),
      h('td', {}, n.short > 0 ? h('span', { class: 'pill off' }, `Manque ${n.short}`) : h('span', { class: 'pill' }, 'Suffisant'))));
  }
}
dateInput.addEventListener('change', loadNeeds);

// ---- Articles ----
async function postMove(action: string, it: Item, qty: number, location = 'store') {
  const r = await api('POST', '/api/hotel/stock', { action, itemId: it.id, qty, location });
  if (!r.ok) { flash(r.data.error || 'Enregistrement impossible.'); return; }
  flash(action === 'inventory' ? 'Inventaire enregistré.' : 'Mouvement enregistré.', true);
  await loadAll();
}
const askQty = (text: string, min = 0): number | null => {
  const v = prompt(text);
  if (v === null) return null;
  const n = Number(v.trim());
  if (!Number.isInteger(n) || n < min) { flash('Quantité invalide (nombre entier).'); return null; }
  return n;
};

function renderItems() {
  const body = $('items-body');
  body.textContent = '';
  $('items-count').textContent = `${items.length} article(s)`;
  if (!items.length) body.appendChild(h('tr', {}, h('td', { colspan: manage ? '8' : '7', class: 'hint' }, manage ? 'Aucun article. Ajoutez-en un ci-dessous ou importez un fichier.' : 'Aucun article.')));
  for (const it of items) {
    const low = it.minStock > 0 && it.store < it.minStock;
    body.appendChild(h('tr', { class: it.active ? '' : 'off' },
      h('td', {}, h('strong', {}, it.name), it.price ? h('div', { class: 'hint' }, `${it.price} FCFA`) : null),
      h('td', {}, KIND[it.kind]),
      h('td', {}, String(it.store), low ? h('span', { class: 'pill off', style: 'margin-left:6px' }, 'Bas') : null),
      h('td', {}, String(it.soiled)), h('td', {}, String(it.laundry)), h('td', {}, String(it.scrap)),
      h('td', {}, it.minStock ? String(it.minStock) : '—'),
      manage && h('td', { class: 'acts' },
        h('button', { class: 'sm', type: 'button', onclick: () => { const n = askQty(`Quantité comptée en réserve pour « ${it.name} » :`); if (n !== null) void postMove('inventory', it, n); } }, 'Compter'),
        h('button', { class: 'sm', type: 'button', onclick: () => { const n = askQty(`Quantité reçue (livraison) pour « ${it.name} » :`, 1); if (n) void postMove('receipt', it, n); } }, '+ Livraison'),
        h('button', { class: 'sm', type: 'button', onclick: () => edit(it) }, 'Modifier')),
    ));
  }
}

function edit(it: Item) {
  const f = $<HTMLFormElement>('item-form');
  editing = it;
  (f.elements.namedItem('name') as HTMLInputElement).value = it.name;
  (f.elements.namedItem('kind') as HTMLSelectElement).value = it.kind;
  (f.elements.namedItem('unit') as HTMLInputElement).value = it.unit;
  (f.elements.namedItem('minStock') as HTMLInputElement).value = String(it.minStock);
  (f.elements.namedItem('price') as HTMLInputElement).value = String(it.price);
  (f.elements.namedItem('active') as HTMLInputElement).checked = it.active;
  $('item-form-title').textContent = `Modifier « ${it.name} »`;
  f.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ---- Gabarits ----
async function loadTemplates() {
  const r = await api<{ lines: PrepRow[] }>('GET', '/api/hotel/templates');
  const body = $('tpl-body');
  body.textContent = '';
  if (!r.ok) { flash(r.data.error || 'Lecture impossible.'); return; }
  if (!r.data.lines.length) body.appendChild(h('tr', {}, h('td', { colspan: manage ? '7' : '6', class: 'hint' }, 'Aucun gabarit défini.')));
  for (const l of r.data.lines) {
    body.appendChild(h('tr', {},
      h('td', {}, l.roomTypeLabel ?? 'Tous'), h('td', {}, KIND_LABEL[l.kind] ?? l.kind), h('td', {}, l.occupancy ? String(l.occupancy) : 'Toutes'),
      h('td', {}, l.cond ? COND[l.cond] : '—'), h('td', {}, l.itemName), h('td', {}, String(l.qty)),
      manage && h('td', {}, h('button', { class: 'sm danger', type: 'button', onclick: async () => {
        const d = await api('DELETE', `/api/hotel/templates/${l.id}`);
        if (!d.ok) flash(d.data.error || 'Suppression impossible.'); else await loadTemplates();
      } }, 'Retirer'))));
  }
}

// ---- Blanchisserie ----
function renderSend() {
  const box = $('laundry-send');
  if (!box) return;
  box.textContent = '';
  const linen = items.filter((i) => i.kind === 'linen' && i.active);
  if (!linen.length) { box.appendChild(h('p', { class: 'hint' }, 'Créez d’abord des articles de nature « Linge ».')); return; }
  const inputs = new Map<number, HTMLInputElement>();
  const note = h('input', { maxlength: '300', placeholder: 'Remarque (facultatif)' }) as HTMLInputElement;
  box.append(
    h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Article'), h('th', {}, 'Linge sale'), h('th', {}, 'À envoyer'))),
      h('tbody', {}, linen.map((i) => {
        const inp = h('input', { type: 'number', min: '0', style: 'width:6rem', value: '' }) as HTMLInputElement;
        inputs.set(i.id, inp);
        return h('tr', {}, h('td', {}, i.name), h('td', {}, String(i.soiled)), h('td', {}, inp));
      })))),
    h('label', {}, 'Remarque', note),
    h('div', { class: 'acts' }, h('button', { class: 'btn', type: 'button', onclick: async () => {
      const lines = [...inputs].map(([itemId, el]) => ({ itemId, qty: Number(el.value) })).filter((l) => l.qty > 0);
      if (!lines.length) { flash('Indiquez au moins une quantité à envoyer.'); return; }
      const r = await api('POST', '/api/hotel/laundry', { lines, note: note.value });
      if (!r.ok) { flash(r.data.error || 'Envoi impossible.'); return; }
      flash('Lot envoyé à la blanchisserie.', true);
      await loadAll();
    } }, 'Envoyer le lot')),
  );
}

async function loadBatches() {
  const r = await api<{ batches: Batch[] }>('GET', '/api/hotel/laundry');
  const box = $('laundry-list');
  box.textContent = '';
  if (!r.ok) { flash(r.data.error || 'Lecture impossible.'); return; }
  box.appendChild(h('h4', {}, 'Lots récents'));
  if (!r.data.batches.length) { box.appendChild(h('p', { class: 'hint' }, 'Aucun lot pour le moment.')); return; }
  for (const b of r.data.batches) {
    const head = h('div', { class: 'task-head' },
      h('strong', {}, `Lot n° ${b.id}`), h('span', { class: 'pill' }, b.status === 'sent' ? 'Chez la blanchisserie' : 'Revenu'),
      h('span', { class: 'hint' }, `envoyé le ${fmtDt(b.sentAt)}${b.staffName ? ` par ${b.staffName}` : ''}${b.receivedAt ? ` · retour le ${fmtDt(b.receivedAt)}` : ''}`));
    if (b.status === 'received' || !manage) {
      box.appendChild(h('div', { class: 'item' }, head, b.note ? h('p', { class: 'hint' }, b.note) : null,
        h('ul', {}, b.lines.map((l) => h('li', {}, b.status === 'received'
          ? `${l.itemName} : ${l.sent} envoyé(s), ${l.received ?? 0} revenu(s), ${l.damaged ?? 0} abîmé(s)${l.missing ? `, ${l.missing} manquant(s)` : ''}`
          : `${l.itemName} : ${l.sent} envoyé(s)`)))));
      continue;
    }
    const ins = new Map<number, { rec: HTMLInputElement; dmg: HTMLInputElement }>();
    box.appendChild(h('div', { class: 'item' }, head, b.note ? h('p', { class: 'hint' }, b.note) : null,
      h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Article'), h('th', {}, 'Envoyé'), h('th', {}, 'Revenu propre'), h('th', {}, 'Abîmé'))),
        h('tbody', {}, b.lines.map((l) => {
          const rec = h('input', { type: 'number', min: '0', style: 'width:6rem', value: String(l.sent) }) as HTMLInputElement;
          const dmg = h('input', { type: 'number', min: '0', style: 'width:6rem', value: '0' }) as HTMLInputElement;
          ins.set(l.itemId, { rec, dmg });
          return h('tr', {}, h('td', {}, l.itemName), h('td', {}, String(l.sent)), h('td', {}, rec), h('td', {}, dmg));
        })))),
      h('div', { class: 'acts' }, h('button', { class: 'btn', type: 'button', onclick: async () => {
        const lines = [...ins].map(([itemId, v]) => ({ itemId, received: Number(v.rec.value), damaged: Number(v.dmg.value) }));
        const d = await api<{ missing?: number }>('PATCH', `/api/hotel/laundry/${b.id}`, { lines });
        if (!d.ok) { flash(d.data.error || 'Réception impossible.'); return; }
        flash(d.data.missing ? `Lot réceptionné, ${d.data.missing} article(s) manquant(s).` : 'Lot réceptionné, compte exact.', true);
        await loadAll();
      } }, 'Réceptionner le lot'))));
  }
}

// ---- Chargement ----
async function loadItems() {
  const r = await api<{ items: Item[] }>('GET', '/api/hotel/items');
  if (!r.ok) { flash(r.data.error || 'Lecture impossible.'); return; }
  items = r.data.items;
  renderItems();
  renderSend();
  const sel = document.getElementById('tpl-item') as HTMLSelectElement | null;
  if (sel) {
    sel.textContent = '';
    const usable = items.filter((i) => i.active && i.kind !== 'minibar');
    sel.appendChild(h('option', { value: '' }, usable.length ? 'Choisir…' : 'Créez d’abord des articles'));
    usable.forEach((i) => sel.appendChild(h('option', { value: String(i.id) }, `${i.name} (${KIND[i.kind]})`)));
  }
}
async function loadAll() { await loadItems(); await Promise.all([loadNeeds(), loadTemplates(), loadBatches()]); }

if (manage) {
  const form = $<HTMLFormElement>('item-form');
  const reset = () => { editing = null; form.reset(); $('item-form-title').textContent = 'Nouvel article'; };
  $('item-cancel').addEventListener('click', reset);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = { name: fd.get('name'), kind: fd.get('kind'), unit: fd.get('unit'), minStock: fd.get('minStock'), price: fd.get('price'), active: fd.get('active') === 'on' };
    const r = editing ? await api('PATCH', `/api/hotel/items/${editing.id}`, body) : await api('POST', '/api/hotel/items', body);
    if (!r.ok) { flash(r.data.error || 'Enregistrement impossible.'); return; }
    flash(editing ? 'Article modifié.' : 'Article créé.', true);
    reset(); await loadAll();
  });

  const tpl = $<HTMLFormElement>('tpl-form');
  tpl.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(tpl);
    const r = await api('POST', '/api/hotel/templates', { roomTypeId: fd.get('roomTypeId'), kind: fd.get('kind'), occupancy: fd.get('occupancy'), cond: fd.get('cond'), itemId: fd.get('itemId'), qty: fd.get('qty') });
    if (!r.ok) { flash(r.data.error || 'Enregistrement impossible.'); return; }
    flash('Gabarit enregistré.', true);
    await Promise.all([loadTemplates(), loadNeeds()]);
  });
  void api<{ types: { id: number; label: string }[] }>('GET', '/api/hotel/room-types').then((r) => {
    const sel = $<HTMLSelectElement>('tpl-type');
    sel.appendChild(h('option', { value: '' }, 'Tous les types'));
    if (r.ok) r.data.types.forEach((t) => sel.appendChild(h('option', { value: String(t.id) }, t.label)));
  });

  mountImport($('import-box'), {
    kind: 'items', fields: ITEM_FIELDS, onDone: () => void loadAll(), templateName: 'modele-articles.csv',
    template: 'Article;Nature;Unité;Seuil;Prix;Stock\nDrap 2 places;linge;pièce;20;0;120\nEau 50 cl;minibar;bouteille;24;500;60\nSavon;consommable;pièce;50;0;300\n',
  });
}

void loadAll();
