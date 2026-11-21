import { api } from '../api';
import { h } from '../dom';

type Charge = { id: number; roomId: number; roomNumber: string; source: string; label: string; qty: number; unitPrice: number; amount: number; carried: boolean; voided: boolean; createdAt: string; staffName: string | null };

const root = document.getElementById('extras-app')!;
const manage = root.dataset.manage === '1';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const msg = $('ex-msg');
const flash = (text: string, ok = false) => { msg.textContent = text; msg.className = ok ? 'ok' : 'err'; };
const SOURCE: Record<string, string> = { minibar: 'Minibar', room_service: 'Room service', laundry: 'Blanchisserie', other: 'Divers' };
const fcfa = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`;
const fmtDt = (iso: string) => { const d = new Date(iso); return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };
const natural = (a: string, b: string) => a.localeCompare(b, 'fr', { numeric: true });

const allBox = document.getElementById('ex-all') as HTMLInputElement | null;

// La liste des chambres vient de l'API des extras : le restaurant n'a pas accès à l'onglet Chambres.
let roomsFilled = false;
function fillRooms(rooms: { id: number; number: string }[]) {
  if (roomsFilled) return;
  roomsFilled = true;
  const sel = $<HTMLSelectElement>('ex-room');
  sel.appendChild(h('option', { value: '' }, 'Choisir…'));
  rooms.forEach((x) => sel.appendChild(h('option', { value: String(x.id) }, x.number)));
}

async function load() {
  const r = await api<{ charges: Charge[]; rooms: { id: number; number: string }[] }>('GET', `/api/hotel/charges${allBox?.checked ? '?all=1' : ''}`);
  const box = $('ex-list');
  box.textContent = '';
  if (!r.ok) { flash(r.data.error || 'Lecture impossible.'); return; }
  fillRooms(r.data.rooms);
  if (!r.data.charges.length) { box.appendChild(h('p', { class: 'hint' }, 'Rien à reporter pour le moment.')); return; }
  const byRoom = new Map<string, Charge[]>();
  for (const c of r.data.charges) (byRoom.get(c.roomNumber) ?? byRoom.set(c.roomNumber, []).get(c.roomNumber)!).push(c);
  for (const room of [...byRoom.keys()].sort(natural)) {
    const lines = byRoom.get(room)!;
    const open = lines.filter((c) => !c.carried && !c.voided);
    const total = open.reduce((s, c) => s + c.amount, 0);
    box.appendChild(h('div', { class: 'item' },
      h('div', { class: 'head-row' },
        h('div', {}, h('strong', {}, `Chambre ${room}`), open.length ? h('div', { class: 'hint' }, `À reporter : ${fcfa(total)}`) : h('div', { class: 'hint' }, 'Tout est reporté')),
        manage && open.length ? h('button', { class: 'btn', type: 'button', onclick: async () => {
          const d = await api('PATCH', '/api/hotel/charges', { ids: open.map((c) => c.id), carried: true });
          if (!d.ok) flash(d.data.error || 'Enregistrement impossible.'); else { flash(`Chambre ${room} : ${fcfa(total)} reporté sur la facture.`, true); await load(); }
        } }, 'Tout marquer reporté') : null),
      h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' },
        h('tbody', {}, lines.map((c) => h('tr', { class: c.voided ? 'off' : '' },
          h('td', {}, c.label, h('div', { class: 'hint' }, `${SOURCE[c.source] ?? c.source} · ${fmtDt(c.createdAt)}${c.staffName ? ` · ${c.staffName}` : ''}`)),
          h('td', {}, `${c.qty} × ${fcfa(c.unitPrice)}`), h('td', {}, h('strong', {}, fcfa(c.amount))),
          h('td', {}, c.voided ? h('span', { class: 'pill off' }, 'Annulé') : c.carried ? h('span', { class: 'pill' }, 'Reporté') : null),
          manage && h('td', { class: 'acts' },
            !c.voided && !c.carried ? h('button', { class: 'sm', type: 'button', onclick: async () => {
              const d = await api('PATCH', '/api/hotel/charges', { ids: [c.id], carried: true });
              if (!d.ok) flash(d.data.error || 'Enregistrement impossible.'); else await load();
            } }, 'Reporté') : null,
            !c.voided && !c.carried ? h('button', { class: 'sm danger', type: 'button', onclick: async () => {
              if (!confirm(`Annuler « ${c.label} » (chambre ${room}) ?`)) return;
              const d = await api('DELETE', `/api/hotel/charges/${c.id}`);
              if (!d.ok) flash(d.data.error || 'Annulation impossible.'); else await load();
            } }, 'Annuler') : null,
            c.carried && !c.voided ? h('button', { class: 'sm', type: 'button', onclick: async () => {
              const d = await api('PATCH', '/api/hotel/charges', { ids: [c.id], carried: false });
              if (!d.ok) flash(d.data.error || 'Enregistrement impossible.'); else await load();
            } }, 'Remettre à reporter') : null))))))));
  }
}

allBox?.addEventListener('change', load);

const form = $<HTMLFormElement>('ex-form');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const r = await api('POST', '/api/hotel/charges', { roomId: fd.get('roomId'), source: fd.get('source'), label: fd.get('label'), qty: fd.get('qty'), unitPrice: fd.get('unitPrice') });
  if (!r.ok) { flash(r.data.error || 'Enregistrement impossible.'); return; }
  flash('Extra enregistré.', true);
  form.reset();
  await load();
});

void load();
