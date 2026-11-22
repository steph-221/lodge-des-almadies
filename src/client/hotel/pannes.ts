import { api } from '../api';
import { h } from '../dom';

type Issue = {
  id: number; roomNumber: string | null; place: string; title: string; detail: string; priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'open' | 'doing' | 'done'; blocksRoom: boolean; reportedByName: string | null; createdAt: string; doneAt: string | null;
};

const root = document.getElementById('is-app')!;
const manage = root.dataset.manage === '1';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const msg = $('is-msg');
const flash = (text: string, ok = false) => { msg.textContent = text; msg.className = ok ? 'ok' : 'err'; };
const PRIO: Record<string, string> = { low: 'Basse', normal: 'Normale', high: 'Haute', urgent: 'Urgente' };
const fmt = (iso: string) => { const d = new Date(iso); return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };

let filled = false;
function fillRooms(rooms: { id: number; number: string }[]) {
  if (filled) return;
  filled = true;
  const sel = $<HTMLSelectElement>('is-room');
  sel.appendChild(h('option', { value: '' }, 'Aucune (lieu ci-contre)'));
  rooms.forEach((r) => sel.appendChild(h('option', { value: String(r.id) }, r.number)));
}

async function move(id: number, status: string, okText: string) {
  const r = await api<{ roomReleased?: boolean }>('PATCH', `/api/hotel/issues/${id}`, { status });
  if (!r.ok) flash(r.data.error || 'Enregistrement impossible.');
  else flash(okText + (r.data.roomReleased ? ' La chambre repasse « sale » : à nettoyer puis contrôler.' : ''), true);
  await load();
}

function card(i: Issue): HTMLElement {
  const where = i.roomNumber ? `Chambre ${i.roomNumber}` : i.place;
  return h('div', { class: 'item' + (i.status === 'done' ? ' task checked' : '') },
    h('div', { class: 'head-row' },
      h('div', {},
        h('strong', {}, `${where} · ${i.title}`),
        i.detail ? h('div', {}, i.detail) : null,
        h('div', { class: 'hint' }, `Signalée le ${fmt(i.createdAt)}${i.reportedByName ? ` par ${i.reportedByName}` : ''}${i.doneAt ? ` · résolue le ${fmt(i.doneAt)}` : ''}`)),
      h('div', { class: 'acts' },
        i.status !== 'done' ? h('span', { class: i.priority === 'urgent' || i.priority === 'high' ? 'pill off' : 'pill' }, PRIO[i.priority]) : null,
        i.blocksRoom && i.status !== 'done' ? h('span', { class: 'pill off' }, 'Chambre bloquée') : null,
        i.status === 'doing' ? h('span', { class: 'pill' }, 'En cours') : null,
        i.status === 'done' ? h('span', { class: 'pill' }, 'Résolue') : null,
        manage && i.status === 'open' ? h('button', { class: 'sm', type: 'button', onclick: () => move(i.id, 'doing', 'Panne prise en charge.') }, 'En cours') : null,
        manage && i.status !== 'done' ? h('button', { class: 'btn', type: 'button', onclick: () => move(i.id, 'done', 'Panne résolue.') }, 'Résolue') : null)));
}

async function load() {
  const r = await api<{ issues: Issue[]; rooms: { id: number; number: string }[] }>('GET', '/api/hotel/issues');
  const box = $('is-list');
  if (!r.ok) { flash(r.data.error || 'Lecture impossible.'); return; }
  fillRooms(r.data.rooms);
  const open = r.data.issues.filter((i) => i.status !== 'done');
  const done = r.data.issues.filter((i) => i.status === 'done');
  box.textContent = '';
  box.appendChild(h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, `À traiter (${open.length})`), open.length ? open.map(card) : h('p', { class: 'hint' }, 'Aucune panne ouverte.')));
  if (done.length) box.appendChild(h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, `Résolues depuis 7 jours (${done.length})`), done.map(card)));
}

const form = $<HTMLFormElement>('is-form');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const r = await api('POST', '/api/hotel/issues', {
    roomId: fd.get('roomId') || null, place: fd.get('place'), title: fd.get('title'), detail: fd.get('detail'),
    priority: fd.get('priority'), blocksRoom: fd.get('blocksRoom') === 'on',
  });
  if (!r.ok) { flash(r.data.error || 'Enregistrement impossible.'); return; }
  flash('Panne signalée à la technique.', true);
  form.reset();
  await load();
});

void load();
setInterval(() => { if (!document.hidden) void load(); }, 30_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void load(); });
