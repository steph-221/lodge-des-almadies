import { api } from '../api';
import { h } from '../dom';
import { fmtDate, plural } from './labels';

type St = { roomNumber: string; guestName: string; guests: number };
type Today = {
  date: string;
  stays: { arrivals: St[]; departures: St[]; stayovers: St[]; occupiedTonight: number; guestsTonight: number; breakfasts: number };
  tasks: { todo: number; doing: number; done: number; checked: number };
  outOfService: string[];
  linenShort: { name: string; short: number; unit: string }[] | null;
  defects: { housekeeping: number | null; maintenance: number | null };
  openExtras: { count: number; total: number } | null;
  unreadLogbook: number;
};
type Entry = { id: number; body: string; pinned: boolean; createdAt: string; authorName: string | null; read: boolean; readers: number };

const root = document.getElementById('today-app')!;
const manage = root.dataset.manage === '1';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const msg = $('t-msg');
const flash = (text: string, ok = false) => { msg.textContent = text; msg.className = ok ? 'ok' : 'err'; };
const dateInput = $<HTMLInputElement>('t-date');
dateInput.value = new Date().toISOString().slice(0, 10); // Dakar = UTC
const fmtDt = (iso: string) => { const d = new Date(iso); return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };

const stat = (n: number | string, label: string) => h('div', { class: 'stat' }, h('b', {}, String(n)), h('span', {}, label));
const stayLine = (s: St) => h('li', {}, h('strong', {}, `Chambre ${s.roomNumber}`), ` · ${plural(s.guests, 'personne', 'personnes')}`, s.guestName ? ` · ${s.guestName}` : '');
const block = (title: string, list: St[]) => h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, `${title} (${list.length})`),
  list.length ? h('ul', { class: 'lines' }, ...list.map(stayLine)) : h('p', { class: 'hint' }, 'Aucune.'));

async function loadToday() {
  const r = await api<Today>('GET', `/api/hotel/today?date=${dateInput.value}`);
  const box = $('t-body');
  box.textContent = '';
  if (!r.ok) { flash(r.data.error || 'Lecture impossible.'); return; }
  flash('');
  const t = r.data;
  $('t-print-title').textContent = `Brief du ${fmtDate(t.date)} — Lodge des Almadies`;
  $('log-unread').textContent = t.unreadLogbook ? `· ${plural(t.unreadLogbook, 'message non lu', 'messages non lus')}` : '';
  box.appendChild(h('div', { class: 'stats' },
    stat(t.stays.arrivals.length, 'Arrivées'), stat(t.stays.departures.length, 'Départs'), stat(t.stays.stayovers.length, 'Recouches'),
    stat(t.stays.occupiedTonight, `Chambres occupées (${t.stays.guestsTonight} pers.)`), stat(t.stays.breakfasts, 'Petits-déjeuners'),
    stat(t.tasks.todo + t.tasks.doing, 'Ménage à faire'), stat(t.tasks.done, 'À contrôler')));
  box.appendChild(h('div', { class: 'row' }, block('Arrivées', t.stays.arrivals), block('Départs', t.stays.departures)));
  box.appendChild(block('Recouches', t.stays.stayovers));
  box.appendChild(h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Chambres hors service'),
    t.outOfService.length ? h('p', {}, t.outOfService.join(', ')) : h('p', { class: 'hint' }, 'Aucune.')));
  if (t.linenShort) box.appendChild(h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Linge et consommables à surveiller'),
    t.linenShort.length ? h('ul', { class: 'lines' }, ...t.linenShort.map((l) => h('li', {}, `${l.name} : il manque ${l.short} ${l.unit}`))) : h('p', { class: 'hint' }, 'Réserve suffisante pour les tâches du jour.')));
  const d = t.defects;
  if (d.housekeeping !== null || d.maintenance !== null) box.appendChild(h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Défauts de visite à corriger'),
    h('p', {}, [d.housekeeping !== null ? `Ménage : ${d.housekeeping}` : '', d.maintenance !== null ? `Technique : ${d.maintenance}` : ''].filter(Boolean).join(' · ')),
    h('a', { href: '/admin/hotel/visites/' }, 'Voir les défauts')));
  if (t.openExtras) box.appendChild(h('div', { class: 'card' }, h('h3', { style: 'margin-top:0' }, 'Extras à reporter sur les factures'),
    h('p', {}, `${plural(t.openExtras.count, 'ligne', 'lignes')} · ${t.openExtras.total.toLocaleString('fr-FR')} FCFA`)));
}

// ---- Cahier de liaison ----
async function loadLog() {
  const r = await api<{ entries: Entry[]; canAck: boolean }>('GET', '/api/hotel/logbook');
  const box = $('log-list');
  box.textContent = '';
  if (!r.ok) { flash(r.data.error || 'Lecture impossible.'); return; }
  if (!r.data.entries.length) { box.appendChild(h('p', { class: 'hint' }, 'Aucun message.')); return; }
  for (const e of r.data.entries) {
    const acts: (HTMLElement | null)[] = [
      r.data.canAck && !e.read ? h('button', { class: 'sm', type: 'button', onclick: async () => { await api('PATCH', `/api/hotel/logbook/${e.id}`, { read: true }); await loadLog(); await loadToday(); } }, 'Marquer comme lu') : null,
      manage ? h('button', { class: 'sm', type: 'button', onclick: async () => { await api('PATCH', `/api/hotel/logbook/${e.id}`, { pinned: !e.pinned }); await loadLog(); } }, e.pinned ? 'Désépingler' : 'Épingler') : null,
      manage ? h('button', { class: 'sm', type: 'button', onclick: async () => { if (!confirm('Retirer ce message ?')) return; await api('DELETE', `/api/hotel/logbook/${e.id}`); await loadLog(); } }, 'Retirer') : null,
    ];
    box.appendChild(h('div', { class: 'item' + (e.pinned ? ' pinned' : ''), style: e.read ? 'opacity:.75' : '' },
      h('div', { class: 'hint' }, `${e.pinned ? 'Épinglé · ' : ''}${e.authorName ?? 'Accès de secours'} · ${fmtDt(e.createdAt)} · lu par ${e.readers}`),
      h('p', { style: 'margin:4px 0;white-space:pre-wrap' }, e.body),
      h('div', { class: 'acts no-print' }, ...acts.filter((x): x is HTMLElement => !!x))));
  }
}

$('log-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const ta = $<HTMLTextAreaElement>('log-body');
  const r = await api('POST', '/api/hotel/logbook', { body: ta.value });
  if (!r.ok) { flash(r.data.error || 'Publication impossible.'); return; }
  ta.value = '';
  flash('Message publié.', true);
  await loadLog();
});

// ---- Destinataires de l'e-mail du matin (direction) ----
const briefForm = document.getElementById('brief-form') as HTMLFormElement | null;
async function loadBrief() {
  if (!briefForm) return;
  const r = await api<{ recipients: string[]; mailReady: boolean; driveReady: boolean }>('GET', '/api/hotel/brief');
  if (!r.ok) return;
  $<HTMLTextAreaElement>('brief-recipients').value = r.data.recipients.join('\n');
  $('brief-state').textContent = `E-mail : ${r.data.mailReady ? 'prêt' : 'inactif (Resend non configuré)'} · Sauvegarde Drive : ${r.data.driveReady ? 'prête' : 'inactive (Google Drive non configuré)'}`;
}
briefForm?.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const r = await api('PUT', '/api/hotel/brief', { recipients: $<HTMLTextAreaElement>('brief-recipients').value });
  if (!r.ok) flash(r.data.error || 'Enregistrement impossible.'); else { flash('Destinataires enregistrés.', true); await loadBrief(); }
});

dateInput.addEventListener('change', () => { void loadToday(); });
$('t-print').addEventListener('click', () => window.print());
void loadToday(); void loadLog(); void loadBrief();
