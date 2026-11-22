import { api } from '../api';
import { h } from '../dom';

type Status = 'request' | 'option' | 'quoted' | 'confirmed' | 'done' | 'cancelled';
type Event = {
  id: number; reference: string; title: string; clientName: string; contactName: string; contactPhone: string; contactEmail: string; attendees: number;
  status: Status; optionUntil: string | null; notes: string; layout: string; equipment: string; breaksNote: string; mealsNote: string; quoteNote: string;
};
type Slot = { id: number; spaceId: number; spaceName: string; date: string; start: string; end: string; label: string; blocking: boolean };
type Line = { id: number; label: string; detail: string; unitFcfa: number; qty: number; total: number };
type Block = { id: number; roomTypeLabel: string; rooms: number; arrival: string; departure: string; note: string };
type Attendee = { id: number; name: string; company: string; diet: string; stayId: number | null; roomNumber: string | null };
type Full = { event: Event; slots: Slot[]; lines: Line[]; total: number | null; blocks: Block[]; attendees: Attendee[]; spaces: { id: number; name: string; active: boolean }[]; roomTypes: { id: number; label: string }[] };

const STATUS: Record<Status, string> = { request: 'Demande', option: 'Option', quoted: 'Devis envoyé', confirmed: 'Confirmé', done: 'Terminé', cancelled: 'Annulé' };
const NEXT: Record<Status, [Status, string][]> = {
  request: [['option', 'Poser une option'], ['quoted', 'Devis envoyé'], ['cancelled', 'Annuler']],
  option: [['quoted', 'Devis envoyé'], ['confirmed', 'Confirmer'], ['request', 'Lever l’option'], ['cancelled', 'Annuler']],
  quoted: [['confirmed', 'Confirmer'], ['option', 'Repasser en option'], ['cancelled', 'Annuler']],
  confirmed: [['done', 'Marquer terminé'], ['quoted', 'Repasser en devis'], ['cancelled', 'Annuler']],
  done: [['confirmed', 'Rouvrir']],
  cancelled: [['request', 'Rouvrir']],
};

const root = document.getElementById('ed-app')!;
const manage = root.dataset.manage === '1';
const id = Number(new URLSearchParams(location.search).get('id'));
const body = document.getElementById('ed-body')!;
const msg = document.getElementById('ed-msg')!;
const flash = (text: string, ok = false) => { msg.textContent = text; msg.className = ok ? 'ok' : 'err'; };
const fmtDate = (d: string) => d.split('-').reverse().join('/');
const fcfa = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);
const field = (label: string, input: HTMLElement) => h('label', {}, label, input);
const inp = (name: string, value: string | number | null, extra: Record<string, string | boolean> = {}) => h('input', { name, value: value == null ? '' : String(value), autocomplete: 'off', ...extra });
const area = (name: string, value: string, rows = 2) => { const t = h('textarea', { name, rows: String(rows), maxlength: '500' }); (t as HTMLTextAreaElement).value = value; return t; };

let rooms: { id: number; number: string }[] = [];
let data: Full;

async function call(method: string, url: string, payload: unknown, okText: string): Promise<boolean> {
  const r = await api(method, url, payload);
  if (!r.ok) { flash(r.data.error || 'Enregistrement impossible.'); return false; }
  flash(okText, true);
  await load();
  return true;
}
const part = (p: string, item?: number) => `/api/hotel/events/${id}/${p}${item ? `?item=${item}` : ''}`;

function head(d: Full): HTMLElement {
  const e = d.event;
  return h('div', { class: 'card' },
    h('div', { class: 'head-row' },
      h('h2', { style: 'margin:0' }, `${e.reference} · ${e.title}`),
      h('span', { class: e.status === 'confirmed' || e.status === 'done' ? 'pill' : 'pill off' }, STATUS[e.status])),
    manage ? h('p', { class: 'hint' }, `${e.clientName}${e.contactName ? ` · ${e.contactName}` : ''}${e.contactPhone ? ` · ${e.contactPhone}` : ''}${e.contactEmail ? ` · ${e.contactEmail}` : ''}`) : null,
    e.optionUntil && (e.status === 'option') ? h('p', { class: 'hint' }, `Option valable jusqu’au ${fmtDate(e.optionUntil)}.`) : null,
    h('div', { class: 'acts no-print' },
      manage ? NEXT[e.status].map(([s, label]) => h('button', { class: s === 'cancelled' ? 'sm' : 'btn', type: 'button', onclick: () => {
        if (s === 'cancelled' && !confirm('Annuler ce dossier ? La salle est libérée, l’historique reste.')) return;
        void call('PATCH', `/api/hotel/events/${id}`, { status: s }, `Dossier : ${STATUS[s].toLowerCase()}.`);
      } }, label)) : null,
      h('a', { class: 'btn-link', href: `/admin/hotel/groupes/fonction/?id=${id}` }, 'Feuille de fonction'),
      manage ? h('a', { class: 'btn-link', href: `/admin/hotel/groupes/devis/?id=${id}` }, 'Devis imprimable') : null));
}

function infoCard(d: Full): HTMLElement | null {
  if (!manage) return null;
  const e = d.event;
  const f = h('form', {},
    h('div', { class: 'row' }, field('Intitulé', inp('title', e.title, { required: true, maxlength: '120' })), field('Client ou société', inp('clientName', e.clientName, { required: true, maxlength: '120' })), field('Participants', inp('attendees', e.attendees, { type: 'number', min: '1', max: '1000', required: true }))),
    h('div', { class: 'row' }, field('Contact', inp('contactName', e.contactName, { maxlength: '120' })), field('Téléphone', inp('contactPhone', e.contactPhone, { maxlength: '40' })), field('E-mail', inp('contactEmail', e.contactEmail, { type: 'email', maxlength: '120' }))),
    h('div', { class: 'row' }, field('Fin de l’option', inp('optionUntil', e.optionUntil, { type: 'date' }))),
    field('Remarques', area('notes', e.notes)),
    h('div', { class: 'acts' }, h('button', { class: 'btn', type: 'submit' }, 'Enregistrer')));
  f.addEventListener('submit', (ev) => { ev.preventDefault(); void call('PATCH', `/api/hotel/events/${id}`, Object.fromEntries(new FormData(f as HTMLFormElement)), 'Dossier enregistré.'); });
  return h('div', { class: 'card no-print' }, h('h3', { style: 'margin-top:0' }, 'Dossier'), f);
}

function slotsCard(d: Full): HTMLElement {
  const list = d.slots.length
    ? d.slots.map((s) => h('div', { class: 'item' }, h('div', { class: 'head-row' },
        h('strong', {}, `${fmtDate(s.date)} · ${s.start} – ${s.end} · ${s.spaceName}${s.label ? ` · ${s.label}` : ''}`),
        h('div', { class: 'acts' }, s.blocking ? h('span', { class: 'pill' }, 'Salle retenue') : h('span', { class: 'pill off' }, 'Ne retient pas la salle'),
          manage ? h('button', { class: 'sm', type: 'button', onclick: () => void call('DELETE', part('slots', s.id), undefined, 'Créneau retiré.') }, 'Retirer') : null))))
    : [h('p', { class: 'hint' }, 'Aucun créneau planifié.')];
  const spaces = d.spaces.filter((s) => s.active);
  let form: HTMLElement | null = null;
  if (manage) {
    const sel = h('select', { name: 'spaceId', required: true }, spaces.map((s) => h('option', { value: String(s.id) }, s.name)));
    const last = d.slots.at(-1);
    form = h('form', {},
      spaces.length ? null : h('p', { class: 'err' }, 'Aucune salle : créez-en une dans la page Groupes & séminaires.'),
      h('div', { class: 'row' }, field('Salle', sel), field('Date', inp('date', last?.date ?? '', { type: 'date', required: true })), field('Début', inp('start', last?.start ?? '09:00', { type: 'time', required: true })), field('Fin', inp('end', last?.end ?? '17:00', { type: 'time', required: true }))),
      field('Libellé (accueil, atelier, déjeuner…)', inp('label', '', { maxlength: '120' })),
      h('div', { class: 'acts' }, h('button', { class: 'btn', type: 'submit' }, 'Ajouter le créneau')));
    form.addEventListener('submit', (ev) => { ev.preventDefault(); void call('POST', part('slots'), Object.fromEntries(new FormData(form as HTMLFormElement)), 'Créneau ajouté.'); });
  }
  const hint = d.event.status === 'request' || d.event.status === 'cancelled'
    ? 'Un dossier « Demande » ou « Annulé » ne retient pas la salle : posez une option pour la bloquer.' : 'La salle est retenue sur ces créneaux ; un autre dossier ne peut pas les chevaucher.';
  return h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Créneaux de salle'), h('p', { class: 'hint' }, hint), list, form);
}

function quoteCard(d: Full): HTMLElement | null {
  if (!manage) return null;
  const rows = d.lines.map((l) => {
    const q = inp('qty', l.qty, { type: 'number', min: '0', max: '100000', style: 'width:90px' });
    const p = inp('unitFcfa', l.unitFcfa, { type: 'number', min: '0', style: 'width:130px' });
    return h('tr', {}, h('td', {}, l.label, l.detail ? h('div', { class: 'hint' }, l.detail) : null), h('td', {}, p), h('td', {}, q), h('td', {}, fcfa(l.total)),
      h('td', {}, h('button', { class: 'sm', type: 'button', onclick: () => void call('PATCH', part('lines', l.id), { qty: (q as HTMLInputElement).value, unitFcfa: (p as HTMLInputElement).value }, 'Ligne mise à jour.') }, 'Enregistrer'),
        h('button', { class: 'sm', type: 'button', onclick: () => void call('DELETE', part('lines', l.id), undefined, 'Ligne retirée.') }, 'Retirer')));
  });
  const first = d.slots[0]?.date, last = d.slots.at(-1)?.date;
  const days = new Set(d.slots.map((s) => s.date)).size || 1;
  const sg = h('form', { class: 'row' },
    field('Jours', inp('days', first && last ? days : 1, { type: 'number', min: '1', max: '30' })),
    field('Personnes', inp('people', d.event.attendees, { type: 'number', min: '1', max: '1000' })),
    field('Pauses par jour', inp('breaksPerDay', 2, { type: 'number', min: '0', max: '10' })),
    h('div', { class: 'acts' }, h('button', { class: 'btn', type: 'submit' }, 'Ajouter les tarifs séminaire du site')));
  sg.addEventListener('submit', (ev) => { ev.preventDefault(); void call('POST', part('lines'), { suggest: Object.fromEntries(new FormData(sg as HTMLFormElement)) }, 'Lignes ajoutées depuis les tarifs du site.'); });
  const add = h('form', { class: 'row' },
    field('Ligne', inp('label', '', { required: true, maxlength: '120', placeholder: 'Déjeuner menu' })), field('Précision', inp('detail', '', { maxlength: '200', placeholder: 'Par personne' })),
    field('Prix unitaire (FCFA)', inp('unitFcfa', '', { type: 'number', min: '0', required: true })), field('Quantité', inp('qty', 1, { type: 'number', min: '0', max: '100000' })),
    h('div', { class: 'acts' }, h('button', { class: 'btn', type: 'submit' }, 'Ajouter')));
  add.addEventListener('submit', (ev) => { ev.preventDefault(); void call('POST', part('lines'), Object.fromEntries(new FormData(add as HTMLFormElement)), 'Ligne ajoutée.'); });
  return h('div', { class: 'card no-print' }, h('h3', { style: 'margin-top:0' }, 'Devis'),
    h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' }, h('thead', {}, h('tr', {}, ...['Ligne', 'Prix unitaire', 'Qté', 'Total', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, rows.length ? rows : h('tr', {}, h('td', { colspan: '5', class: 'hint' }, 'Aucune ligne.'))),
      h('tfoot', {}, h('tr', {}, h('th', { colspan: '3' }, 'Total'), h('th', { colspan: '2' }, fcfa(d.total ?? 0)))))),
    h('h4', {}, 'Proposer les lignes depuis les tarifs du site'), sg, h('h4', {}, 'Ajouter une ligne'), add);
}

function sheetCard(d: Full): HTMLElement {
  const e = d.event;
  const rows: [string, string, string][] = [['layout', 'Disposition de la salle', e.layout], ['equipment', 'Matériel', e.equipment], ['breaksNote', 'Pauses', e.breaksNote], ['mealsNote', 'Repas', e.mealsNote]];
  if (!manage) return h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Feuille de fonction'), rows.map(([, l, v]) => h('p', {}, h('strong', {}, `${l} : `), v || '—')));
  const f = h('form', {}, rows.map(([k, l, v]) => field(l, area(k, v))),
    field('Conditions affichées sur le devis', area('quoteNote', e.quoteNote)),
    h('div', { class: 'acts' }, h('button', { class: 'btn', type: 'submit' }, 'Enregistrer')));
  f.addEventListener('submit', (ev) => { ev.preventDefault(); void call('PATCH', `/api/hotel/events/${id}`, Object.fromEntries(new FormData(f as HTMLFormElement)), 'Feuille de fonction enregistrée.'); });
  return h('div', { class: 'card no-print' }, h('h3', { style: 'margin-top:0' }, 'Feuille de fonction'), f);
}

function blocksCard(d: Full): HTMLElement {
  const list = d.blocks.length ? d.blocks.map((b) => h('div', { class: 'item' }, h('div', { class: 'head-row' },
    h('strong', {}, `${b.rooms} chambre(s) · ${b.roomTypeLabel} · du ${fmtDate(b.arrival)} au ${fmtDate(b.departure)}${b.note ? ` · ${b.note}` : ''}`),
    manage ? h('button', { class: 'sm', type: 'button', onclick: () => void call('DELETE', part('blocks', b.id), undefined, 'Bloc retiré.') }, 'Retirer') : null))) : [h('p', { class: 'hint' }, 'Aucune chambre réservée pour ce groupe.')];
  let form: HTMLElement | null = null;
  if (manage) {
    const sel = h('select', { name: 'roomTypeId' }, h('option', { value: '' }, 'Tout type'), d.roomTypes.map((t) => h('option', { value: String(t.id) }, t.label)));
    const first = d.slots[0]?.date, last = d.slots.at(-1)?.date;
    form = h('form', {},
      h('div', { class: 'row' }, field('Type', sel), field('Chambres', inp('rooms', 5, { type: 'number', min: '1', max: '100', required: true })), field('Arrivée', inp('arrival', first ?? '', { type: 'date', required: true })), field('Départ', inp('departure', last ? addDays(last, 1) : '', { type: 'date', required: true }))),
      field('Remarque', inp('note', '', { maxlength: '200' })), h('div', { class: 'acts' }, h('button', { class: 'btn', type: 'submit' }, 'Ajouter le bloc')));
    form.addEventListener('submit', (ev) => { ev.preventDefault(); void call('POST', part('blocks'), Object.fromEntries(new FormData(form as HTMLFormElement)), 'Bloc de chambres ajouté.'); });
  }
  return h('div', { class: 'card no-print' }, h('h3', { style: 'margin-top:0' }, 'Bloc de chambres'),
    h('p', { class: 'hint' }, 'Réserve de chambres pour le groupe (information). Les séjours se créent depuis la liste des participants.'), list, form);
}

function attendeesCard(d: Full): HTMLElement {
  const first = d.slots[0]?.date, last = d.slots.at(-1)?.date;
  const items = d.attendees.map((a) => {
    const info = manage ? `${a.name}${a.company ? ` · ${a.company}` : ''}` : (a.diet ? 'Participant' : 'Participant');
    const row = h('div', { class: 'item' }, h('div', { class: 'head-row' },
      h('div', {}, h('strong', {}, info), a.diet ? h('div', { class: 'hint' }, `Régime : ${a.diet}`) : null),
      h('div', { class: 'acts' }, a.stayId ? h('span', { class: 'pill' }, a.roomNumber ? `Chambre ${a.roomNumber}` : 'Séjour créé') : null,
        manage && !a.stayId ? h('button', { class: 'sm', type: 'button', onclick: () => stayForm(a, row) }, 'Créer le séjour') : null,
        manage ? h('button', { class: 'sm', type: 'button', onclick: () => void call('DELETE', part('attendees', a.id), undefined, 'Participant retiré.') }, 'Retirer') : null)));
    return row;
  });
  function stayForm(a: Attendee, row: HTMLElement) {
    const sel = h('select', { name: 'roomId', required: true }, rooms.map((r) => h('option', { value: String(r.id) }, r.number)));
    const f = h('form', { class: 'row' }, field('Chambre', sel), field('Arrivée', inp('arrival', first ?? '', { type: 'date', required: true })), field('Départ', inp('departure', last ? addDays(last, 1) : '', { type: 'date', required: true })),
      h('div', { class: 'acts' }, h('button', { class: 'btn', type: 'submit' }, 'Créer'), h('button', { class: 'sm', type: 'button', onclick: () => f.remove() }, 'Fermer')));
    f.addEventListener('submit', (ev) => { ev.preventDefault(); void call('PATCH', part('attendees', a.id), { createStay: Object.fromEntries(new FormData(f as HTMLFormElement)) }, 'Séjour créé dans Réservations.'); });
    row.appendChild(f);
  }
  let forms: HTMLElement | null = null;
  if (manage) {
    const paste = h('form', {}, field('Coller une liste (un participant par ligne : nom ; société ; régime)', h('textarea', { name: 'text', rows: '4' })), h('div', { class: 'acts' }, h('button', { class: 'btn', type: 'submit' }, 'Importer la liste')));
    paste.addEventListener('submit', (ev) => { ev.preventDefault(); void call('POST', part('attendees'), Object.fromEntries(new FormData(paste as HTMLFormElement)), 'Participants importés.'); });
    const one = h('form', { class: 'row' }, field('Nom', inp('name', '', { required: true, maxlength: '120' })), field('Société', inp('company', '', { maxlength: '120' })), field('Régime, allergies', inp('diet', '', { maxlength: '120' })),
      h('div', { class: 'acts' }, h('button', { class: 'btn', type: 'submit' }, 'Ajouter')));
    one.addEventListener('submit', (ev) => { ev.preventDefault(); void call('POST', part('attendees'), Object.fromEntries(new FormData(one as HTMLFormElement)), 'Participant ajouté.'); });
    forms = h('div', {}, one, paste);
  }
  return h('div', { class: 'card no-print' }, h('h3', { style: 'margin-top:0' }, `Participants (${d.attendees.length}/${d.event.attendees})`),
    manage ? null : h('p', { class: 'hint' }, 'Les noms sont réservés à la direction et à la réception ; les régimes alimentaires restent visibles pour le restaurant.'),
    items.length ? items : h('p', { class: 'hint' }, 'Aucun participant saisi.'), forms);
}

function render(d: Full) {
  body.textContent = '';
  [head(d), infoCard(d), slotsCard(d), quoteCard(d), sheetCard(d), blocksCard(d), attendeesCard(d)].forEach((n) => n && body.appendChild(n));
  document.title = `${d.event.reference} | Lodge des Almadies`;
}

async function load() {
  const r = await api<Full>('GET', `/api/hotel/events/${id}`);
  if (!r.ok) { flash(r.data.error || 'Dossier introuvable.'); return; }
  data = r.data;
  render(data);
}

async function init() {
  if (!Number.isInteger(id) || id <= 0) { flash('Dossier inconnu.'); return; }
  if (manage) { const r = await api<{ rooms: { id: number; number: string }[] }>('GET', '/api/hotel/rooms'); if (r.ok) rooms = r.data.rooms; }
  await load();
}
void init();
