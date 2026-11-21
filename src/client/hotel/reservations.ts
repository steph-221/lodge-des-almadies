import { api } from '../api';
import { h } from '../dom';
import { STAY_FIELDS } from '../../lib/hotel/import';
import { mountImport } from './import-ui';
import { fmtDate } from './labels';

type Stay = {
  id: number; roomId: number; roomNumber: string; guestName: string; guests: number; arrival: string; departure: string;
  arrivalTime: string | null; extraBed: boolean; babyCot: boolean; notes: string; source: string;
};
type Room = { id: number; number: string; active: boolean; typeLabel: string | null; maxCapacity: number | null };

const root = document.getElementById('stays-app')!;
const manage = root.dataset.manage === '1';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const flash = (el: HTMLElement, text: string, ok = false) => { el.textContent = text; el.className = ok ? 'ok' : 'err'; };
const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 86400000).toISOString().slice(0, 10);

const from = $<HTMLInputElement>('stay-from'), to = $<HTMLInputElement>('stay-to');
const msg = $('stay-msg');
const today = new Date().toISOString().slice(0, 10);
from.value = addDays(today, -1);
to.value = addDays(today, 30);

let editing: Stay | null = null;
let editHandler: ((s: Stay) => void) | null = null; // défini plus bas pour les rôles qui peuvent modifier

async function load() {
  const r = await api<{ stays: Stay[] }>('GET', `/api/hotel/stays?from=${from.value}&to=${to.value}`);
  const body = $('stays-body');
  body.textContent = '';
  if (!r.ok) { flash(msg, r.data.error || 'Lecture impossible.'); return; }
  if (!r.data.stays.length) {
    body.appendChild(h('tr', {}, h('td', { colspan: manage ? '7' : '6', class: 'hint' }, manage
      ? 'Aucun séjour sur cette période. Saisissez-en un ci-dessous ou importez un fichier.'
      : 'Aucun séjour sur cette période.')));
  }
  for (const s of r.data.stays) {
    const extras = [s.extraBed ? 'lit d’appoint' : '', s.babyCot ? 'lit bébé' : '', s.notes].filter(Boolean).join(' · ');
    body.appendChild(h('tr', {},
      h('td', {}, h('strong', {}, s.roomNumber)), h('td', {}, s.guestName), h('td', {}, String(s.guests)),
      h('td', {}, fmtDate(s.arrival) + (s.arrivalTime ? ` ${s.arrivalTime}` : '')), h('td', {}, fmtDate(s.departure)),
      h('td', { class: 'hint' }, extras || '—'),
      manage && h('td', { class: 'acts' },
        h('button', { class: 'sm', type: 'button', onclick: () => editHandler?.(s) }, 'Modifier'),
        h('button', { class: 'sm danger', type: 'button', onclick: async () => {
          if (!confirm(`Annuler le séjour de ${s.guestName} (chambre ${s.roomNumber}) ?`)) return;
          const d = await api('DELETE', `/api/hotel/stays/${s.id}`);
          if (!d.ok) flash(msg, d.data.error || 'Annulation impossible.'); else await load();
        } }, 'Annuler')),
    ));
  }
}

from.addEventListener('change', load);
to.addEventListener('change', load);

if (manage) {
  const form = $<HTMLFormElement>('stay-form');
  const roomSel = form.elements.namedItem('roomId') as HTMLSelectElement;

  const set = (name: string, v: string | boolean) => {
    const el = form.elements.namedItem(name) as HTMLInputElement;
    if (el.type === 'checkbox') el.checked = Boolean(v); else el.value = String(v);
  };
  editHandler = (s: Stay) => {
    editing = s;
    set('roomId', String(s.roomId)); set('guestName', s.guestName); set('guests', String(s.guests)); set('arrival', s.arrival); set('departure', s.departure);
    set('arrivalTime', s.arrivalTime ?? ''); set('extraBed', s.extraBed); set('babyCot', s.babyCot); set('notes', s.notes);
    $('stay-form-title').textContent = `Modifier le séjour de ${s.guestName}`;
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const reset = () => { editing = null; form.reset(); $('stay-form-title').textContent = 'Nouveau séjour'; };
  $('stay-cancel').addEventListener('click', reset);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const body = {
      roomId: Number(fd.get('roomId')), guestName: fd.get('guestName'), guests: fd.get('guests'), arrival: fd.get('arrival'), departure: fd.get('departure'),
      arrivalTime: fd.get('arrivalTime'), extraBed: fd.get('extraBed') === 'on', babyCot: fd.get('babyCot') === 'on', notes: fd.get('notes'),
    };
    const r = editing ? await api('PATCH', `/api/hotel/stays/${editing.id}`, body) : await api('POST', '/api/hotel/stays', body);
    if (!r.ok) { flash(msg, r.data.error || 'Enregistrement impossible.'); return; }
    flash(msg, editing ? 'Séjour modifié.' : 'Séjour enregistré.', true);
    reset(); await load();
  });

  void api<{ rooms: Room[] }>('GET', '/api/hotel/rooms').then((rooms) => {
    if (!rooms.ok) return;
    const active = rooms.data.rooms.filter((r) => r.active);
    roomSel.appendChild(h('option', { value: '' }, active.length ? 'Choisir…' : 'Aucune chambre : créez-les d’abord'));
    active.forEach((r) => roomSel.appendChild(h('option', { value: String(r.id) }, r.number + (r.typeLabel ? ` — ${r.typeLabel}` : ''))));
  });

  mountImport($('import-box'), {
    kind: 'stays', fields: STAY_FIELDS, onDone: load, templateName: 'modele-sejours.csv',
    template: 'Chambre;Nom du client;Personnes;Arrivée;Départ;Heure d’arrivée;Lit d’appoint;Lit bébé;Remarques;Référence\n101;Diop Awa;2;20/11/2026;23/11/2026;14:30;non;non;;RES-0001\n',
  });
}

void load();
