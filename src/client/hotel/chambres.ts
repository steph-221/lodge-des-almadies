import { api } from '../api';
import { h } from '../dom';
import { ROOM_FIELDS } from '../../lib/hotel/import';
import { mountImport } from './import-ui';
import { KIND_LABEL, STATUS_LABEL, TASK_LABEL, plural } from './labels';

type Task = {
  id: number; roomNumber: string; building: string; floor: string; typeLabel: string | null; kind: string; guests: number | null;
  arrivalToday: boolean; extraBed: boolean; babyCot: boolean; status: string; assignedTo: number | null; assignedName: string | null;
};
type AmenityValue = 'oui' | 'non' | 'sur_demande' | 'supplement' | 'a_verifier';
type Amenity = { key: string; labelFr: string; labelEn: string; position: number };
type RoomType = {
  id: number; code: string; label: string; baseCapacity: number; maxCapacity: number; beds: string; active: boolean;
  labelEn: string; building: string; location: string; areaM2: number | null; priceFcfa: number | null; extraBedFcfa: number | null;
  descriptionFr: string; descriptionEn: string; roomCount: number; amenities: { key: string; value: AmenityValue }[];
};
const AMENITY_LABEL: Record<AmenityValue, string> = { oui: 'Oui', non: 'Non', sur_demande: 'Sur demande', supplement: 'En supplément', a_verifier: 'À vérifier' };
const fcfa = (n: number | null) => (n == null ? '—' : `${n.toLocaleString('fr-FR')} FCFA`);
type Room = { id: number; number: string; building: string; floor: string; roomTypeId: number | null; typeLabel: string | null; minibar: boolean; notes: string; active: boolean; status: string };

const root = document.getElementById('rooms-app')!;
const manage = root.dataset.manage === '1';
const fdc: { id: number; name: string }[] = JSON.parse(root.dataset.fdc || '[]');
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const flash = (el: HTMLElement, text: string, ok = false) => { el.textContent = text; el.className = ok ? 'ok' : 'err'; };

// ───────── Tâches du jour ─────────
const taskBox = $('tasks');
const taskMsg = $('tasks-msg');
const dateInput = $<HTMLInputElement>('task-date');

async function setStatus(id: number, status: string) {
  const r = await api('PATCH', `/api/hotel/tasks/${id}`, { status });
  if (!r.ok) flash(taskMsg, r.data.error || 'Action impossible.');
  await loadTasks();
}

function taskCard(t: Task): HTMLElement {
  const extras = [t.extraBed ? 'lit d’appoint' : '', t.babyCot ? 'lit bébé' : ''].filter(Boolean);
  const who = t.guests ? `${t.arrivalToday ? 'Arrivée aujourd’hui' : 'Séjour en cours'} : ${plural(t.guests, 'personne', 'personnes')}` : t.kind === 'depart' ? 'Pas d’arrivée prévue aujourd’hui' : '';
  const place = [t.building && `Bât. ${t.building}`, t.floor && `étage ${t.floor}`, t.typeLabel].filter(Boolean).join(' · ');
  const acts: (HTMLElement | null)[] = [];
  const btn = (label: string, status: string, primary = false) =>
    h('button', { class: primary ? 'btn' : 'sm', type: 'button', onclick: () => setStatus(t.id, status) }, label);
  if (t.status === 'todo') acts.push(btn('Commencer', 'doing', true));
  if (t.status === 'doing') acts.push(btn('Terminée', 'done', true));
  if (manage) {
    if (t.status === 'done') acts.push(btn('Contrôlée', 'checked', true));
    if (t.status !== 'todo') acts.push(btn('Rouvrir', 'todo'));
    acts.push(h('select', {
      'aria-label': `Attribuer la chambre ${t.roomNumber}`,
      onchange: async (e: Event) => {
        const v = (e.target as HTMLSelectElement).value;
        const r = await api('PATCH', `/api/hotel/tasks/${t.id}`, { assignedTo: v === '' ? null : Number(v) });
        if (!r.ok) flash(taskMsg, r.data.error || 'Attribution impossible.');
        await loadTasks();
      },
    }, h('option', { value: '' }, 'Non attribuée'), fdc.map((f) => h('option', { value: String(f.id), selected: f.id === t.assignedTo }, f.name))));
  }
  return h('div', { class: `item task ${t.status}` },
    h('div', { class: 'task-head' }, h('strong', {}, `Chambre ${t.roomNumber}`), h('span', { class: 'pill' }, KIND_LABEL[t.kind] ?? t.kind), h('span', { class: 'pill' }, TASK_LABEL[t.status] ?? t.status)),
    place && h('p', { class: 'hint' }, place),
    who && h('p', {}, who + (extras.length ? ` · ${extras.join(', ')}` : '')),
    !manage ? null : t.assignedName && h('p', { class: 'hint' }, `Attribuée à ${t.assignedName}`),
    h('div', { class: 'acts' }, acts),
  );
}

async function loadTasks() {
  const r = await api<{ tasks: Task[] }>('GET', `/api/hotel/tasks?date=${dateInput.value}`);
  taskBox.textContent = '';
  if (!r.ok) { flash(taskMsg, r.data.error || 'Lecture impossible.'); return; }
  if (!r.data.tasks.length) {
    taskBox.appendChild(h('p', { class: 'hint' }, manage
      ? 'Aucune tâche ce jour-là. Saisissez ou importez les séjours, puis cliquez sur « Préparer les tâches ».'
      : 'Aucune tâche ne vous est attribuée ce jour-là.'));
    return;
  }
  const open = r.data.tasks.filter((t) => t.status !== 'checked').length;
  taskBox.appendChild(h('p', { class: 'hint' }, `${plural(r.data.tasks.length, 'chambre', 'chambres')} · ${open} à terminer ou contrôler`));
  r.data.tasks.forEach((t) => taskBox.appendChild(taskCard(t)));
}

dateInput.addEventListener('change', loadTasks);
$('tasks-generate')?.addEventListener('click', async (e) => {
  const b = e.target as HTMLButtonElement;
  b.disabled = true;
  const r = await api<{ created: number; updated: number; removed: number }>('POST', '/api/hotel/tasks', { date: dateInput.value });
  b.disabled = false;
  if (!r.ok) { flash(taskMsg, r.data.error || 'Préparation impossible.'); return; }
  flash(taskMsg, `Tâches préparées : ${r.data.created} créée(s), ${r.data.updated} mise(s) à jour, ${r.data.removed} retirée(s).`, true);
  await loadTasks();
});

// ───────── Chambres et types (direction, gouvernante, réception) ─────────
if (manage) {
  let types: RoomType[] = [];
  let amenities: Amenity[] = [];
  let rooms: Room[] = [];
  let editingRoom: Room | null = null;
  let editingType: RoomType | null = null;

  const roomMsg = $('room-msg'), typeMsg = $('type-msg');
  const roomForm = $<HTMLFormElement>('room-form'), typeForm = $<HTMLFormElement>('type-form');
  const typeSelect = roomForm.elements.namedItem('roomTypeId') as HTMLSelectElement;

  const fill = (f: HTMLFormElement, values: Record<string, string | boolean>) => {
    for (const [k, v] of Object.entries(values)) {
      const el = f.elements.namedItem(k) as HTMLInputElement | null;
      if (!el) continue;
      if (el.type === 'checkbox') el.checked = Boolean(v); else el.value = String(v);
    }
  };

  // Grille des équipements : affichée seulement quand on modifie un type existant.
  function renderAmenityGrid(t: RoomType | null) {
    const box = $('amenities-box'), grid = $('amenities-grid');
    grid.textContent = '';
    box.hidden = !t || !amenities.length;
    if (!t) return;
    const current = new Map(t.amenities.map((a) => [a.key, a.value]));
    amenities.forEach((a) => {
      const v = current.get(a.key) ?? '';
      grid.appendChild(h('label', { class: v === 'a_verifier' ? 'todo' : '' }, a.labelFr,
        h('select', { name: `amenity:${a.key}` },
          h('option', { value: '', selected: v === '' }, '—'),
          ...Object.entries(AMENITY_LABEL).map(([k, l]) => h('option', { value: k, selected: k === v }, l)))));
    });
  }

  function renderTypes() {
    typeSelect.textContent = '';
    typeSelect.appendChild(h('option', { value: '' }, '— aucun —'));
    types.filter((t) => t.active).forEach((t) => typeSelect.appendChild(h('option', { value: String(t.id) }, t.label)));
    const body = $('types-body');
    body.textContent = '';
    if (!types.length) body.appendChild(h('tr', {}, h('td', { colspan: '6', class: 'hint' }, 'Aucun type pour le moment (par exemple : Double, Twin, Suite). Vous pouvez aussi les créer en important les chambres.')));
    types.forEach((t) => body.appendChild(h('tr', {},
      h('td', {}, h('strong', {}, t.label), h('div', { class: 'type-desc' }, [t.code, t.location].filter(Boolean).join(' · '))),
      h('td', {}, String(t.roomCount)), h('td', {}, `${t.baseCapacity} (max ${t.maxCapacity})`), h('td', {}, t.beds || '—'),
      h('td', {}, fcfa(t.priceFcfa), t.extraBedFcfa != null ? h('div', { class: 'type-desc' }, `lit sup. ${fcfa(t.extraBedFcfa)}`) : ''),
      h('td', { class: 'acts' },
        h('button', { class: 'sm', type: 'button', onclick: () => {
          editingType = t;
          fill(typeForm, {
            code: t.code, label: t.label, baseCapacity: String(t.baseCapacity), maxCapacity: String(t.maxCapacity), beds: t.beds,
            labelEn: t.labelEn, building: t.building, location: t.location, areaM2: t.areaM2 == null ? '' : String(t.areaM2),
            priceFcfa: t.priceFcfa == null ? '' : String(t.priceFcfa), extraBedFcfa: t.extraBedFcfa == null ? '' : String(t.extraBedFcfa),
            descriptionFr: t.descriptionFr, descriptionEn: t.descriptionEn,
          });
          renderAmenityGrid(t);
          $('type-form-title').textContent = `Modifier le type « ${t.label} »`;
          typeForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } }, 'Modifier'),
        h('button', { class: t.active ? 'sm danger' : 'sm', type: 'button', onclick: async () => {
          const r = await api('PATCH', `/api/hotel/room-types/${t.id}`, { active: !t.active });
          if (!r.ok) flash(typeMsg, r.data.error || 'Action impossible.'); else await loadRooms();
        } }, t.active ? 'Désactiver' : 'Réactiver')),
    )));
  }

  function renderRooms() {
    const body = $('rooms-body');
    body.textContent = '';
    if (!rooms.length) body.appendChild(h('tr', {}, h('td', { colspan: '7', class: 'hint' }, 'Aucune chambre pour le moment : ajoutez-les une par une ci-dessous, ou importez un fichier.')));
    rooms.forEach((r) => body.appendChild(h('tr', { class: r.active ? '' : 'off' },
      h('td', {}, h('strong', {}, r.number)), h('td', {}, r.building || '—'), h('td', {}, r.floor || '—'), h('td', {}, r.typeLabel || '—'),
      h('td', {}, r.minibar ? 'Oui' : '—'),
      h('td', {}, h('select', {
        'aria-label': `État de la chambre ${r.number}`,
        onchange: async (e: Event) => {
          const v = (e.target as HTMLSelectElement).value;
          const res = await api('PATCH', `/api/hotel/rooms/${r.id}`, { status: v });
          if (!res.ok) flash(roomMsg, res.data.error || 'Changement impossible.'); else await loadRooms();
        },
      }, Object.entries(STATUS_LABEL).map(([k, v]) => h('option', { value: k, selected: k === r.status }, v)))),
      h('td', { class: 'acts' },
        h('button', { class: 'sm', type: 'button', onclick: () => {
          editingRoom = r;
          fill(roomForm, { number: r.number, building: r.building, floor: r.floor, roomTypeId: r.roomTypeId ? String(r.roomTypeId) : '', minibar: r.minibar, notes: r.notes });
          $('room-form-title').textContent = `Modifier la chambre ${r.number}`;
          roomForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } }, 'Modifier'),
        h('button', { class: r.active ? 'sm danger' : 'sm', type: 'button', onclick: async () => {
          if (r.active && !confirm(`Désactiver la chambre ${r.number} ? Elle n’apparaîtra plus dans les tâches ni pour de nouveaux séjours.`)) return;
          const res = await api('PATCH', `/api/hotel/rooms/${r.id}`, { active: !r.active });
          if (!res.ok) flash(roomMsg, res.data.error || 'Action impossible.'); else await loadRooms();
        } }, r.active ? 'Désactiver' : 'Réactiver')),
    )));
    $('rooms-count').textContent = rooms.length ? `${rooms.filter((x) => x.active).length} chambre(s) active(s)` : '';
  }

  async function loadRooms() {
    const r = await api<{ rooms: Room[]; types: RoomType[]; amenities: Amenity[] }>('GET', '/api/hotel/rooms');
    if (!r.ok) { flash(roomMsg, r.data.error || 'Lecture impossible.'); return; }
    rooms = r.data.rooms; types = r.data.types; amenities = r.data.amenities ?? [];
    renderTypes(); renderRooms();
  }

  const resetRoom = () => { editingRoom = null; roomForm.reset(); $('room-form-title').textContent = 'Ajouter une chambre'; };
  const resetType = () => { editingType = null; typeForm.reset(); renderAmenityGrid(null); $('type-form-title').textContent = 'Ajouter un type de chambre'; };

  roomForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(roomForm);
    const body = { number: fd.get('number'), building: fd.get('building'), floor: fd.get('floor'), roomTypeId: fd.get('roomTypeId') || null, minibar: fd.get('minibar') === 'on', notes: fd.get('notes') };
    const r = editingRoom ? await api('PATCH', `/api/hotel/rooms/${editingRoom.id}`, body) : await api('POST', '/api/hotel/rooms', body);
    if (!r.ok) { flash(roomMsg, r.data.error || 'Enregistrement impossible.'); return; }
    flash(roomMsg, editingRoom ? 'Chambre modifiée.' : 'Chambre ajoutée.', true);
    resetRoom(); await loadRooms();
  });
  typeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(typeForm);
    const body: Record<string, unknown> = {};
    for (const k of ['code', 'label', 'baseCapacity', 'maxCapacity', 'beds', 'labelEn', 'building', 'location', 'areaM2', 'priceFcfa', 'extraBedFcfa', 'descriptionFr', 'descriptionEn']) body[k] = fd.get(k);
    if (editingType) {
      const grid: Record<string, string> = {};
      for (const [k, v] of fd.entries()) if (k.startsWith('amenity:') && v) grid[k.slice(8)] = String(v);
      body.amenities = grid;
    }
    const r = editingType ? await api('PATCH', `/api/hotel/room-types/${editingType.id}`, body) : await api('POST', '/api/hotel/room-types', body);
    if (!r.ok) { flash(typeMsg, r.data.error || 'Enregistrement impossible.'); return; }
    flash(typeMsg, editingType ? 'Type modifié.' : 'Type ajouté.', true);
    resetType(); await loadRooms();
  });
  $('room-cancel').addEventListener('click', resetRoom);
  $('type-cancel').addEventListener('click', resetType);

  mountImport($('import-box'), {
    kind: 'rooms', fields: ROOM_FIELDS, onDone: loadRooms, templateName: 'modele-chambres.csv',
    template: 'Numéro;Bâtiment;Étage;Type;Minibar;Remarques\n101;A;1;Double;oui;\n102;A;1;Twin;non;Vue piscine\n',
  });
  void loadRooms();
}

dateInput.value = new Date().toISOString().slice(0, 10);
void loadTasks();
