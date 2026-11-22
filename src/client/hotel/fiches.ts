import { api } from '../api';
import { h } from '../dom';
import { shrink } from '../image';

type Summary = { id: number; code: string; date: string; staffName: string | null; status: 'printed' | 'read' | 'validated' | 'cancelled'; rooms: number; hasPhoto: boolean };
type Item = { itemId: number; name: string; dotation: number };
type Row = { taskId: number; roomId: number; roomNumber: string; kind: 'depart' | 'recouche'; guests: number | null; minibar: Item[] };
type ReadRow = { taskId: number; done: boolean | null; minibar: { itemId: number; count: number | null; sure: boolean }[]; note: string; flags: string[] };
type Detail = Summary & {
  rows: Row[]; fileId: number | null;
  read: { status: 'read' | 'failed'; error: string; model: string; parsed: { codeMatches: boolean; problems: string[]; rows: ReadRow[] } | null } | null;
};
type List = { date: string; sheets: Summary[]; staff: { id: number; name: string }[]; canEdit: boolean; vision: boolean; storage: string | null };

const root = document.getElementById('sheets-app')!;
const editor = root.dataset.editor === '1';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const msg = $('sh-msg');
const flash = (text: string, ok = false) => { msg.textContent = text; msg.className = ok ? 'ok' : 'err'; };
const dateEl = $<HTMLInputElement>('sh-date');
dateEl.value = new Date().toISOString().slice(0, 10);
const STATUS = { printed: 'À remplir', read: 'Photo reçue', validated: 'Validée', cancelled: 'Annulée' } as const;
let env: List | null = null;

async function sendPhoto(sheet: Summary, file: File) {
  flash('Envoi et lecture de la photo… (quelques secondes)');
  try {
    const blob = await shrink(file, 2000, 0.85);
    const r = await fetch(`/api/hotel/sheets/${sheet.id}/photo`, { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: blob });
    const d = (await r.json().catch(() => ({}))) as { error?: string; status?: string };
    if (r.status === 401) { location.href = '/admin/'; return; }
    if (!r.ok) { flash(d.error || 'Envoi impossible.'); return; }
    flash(editor ? (d.status === 'read' ? 'Photo lue : contrôlez les cases ci-dessous.' : 'Photo reçue, mais la lecture a échoué : saisissez la fiche à la main.') : 'Photo envoyée, merci.', d.status === 'read' || !editor);
  } catch { flash('Photo illisible : reprenez-la.'); }
  await load();
  if (editor) await openSheet(sheet.id);
}

function photoButton(s: Summary): HTMLElement {
  const input = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void sendPhoto(s, f); } }) as HTMLInputElement;
  return h('span', {}, input, h('button', { class: 'sm', type: 'button', onclick: () => input.click() }, s.hasPhoto ? 'Renvoyer une photo' : 'Envoyer la photo'));
}

async function load() {
  const r = await api<List>('GET', `/api/hotel/sheets?date=${dateEl.value}`);
  if (!r.ok) { flash(r.data.error || 'Lecture impossible.'); return; }
  env = r.data;
  $('sh-status').textContent = editor ? (env.vision ? 'Lecture par IA : activée' : 'Lecture par IA : non configurée (saisie à la main)') : '';
  const form = $<HTMLFormElement>('sh-new');
  form.hidden = !editor;
  if (editor) {
    const sel = $<HTMLSelectElement>('sh-staff');
    sel.textContent = '';
    for (const s of env.staff) sel.appendChild(h('option', { value: String(s.id) }, s.name));
    sel.appendChild(h('option', { value: '' }, 'Chambres non attribuées'));
  }
  const box = $('sh-list');
  box.textContent = '';
  if (!env.sheets.length) { box.appendChild(h('p', { class: 'hint' }, editor ? 'Aucune fiche ce jour-là.' : 'Aucune fiche pour vous ce jour-là.')); return; }
  for (const s of env.sheets) {
    const open = s.status === 'printed' || s.status === 'read';
    box.appendChild(h('div', { class: 'item', style: s.status === 'cancelled' ? 'opacity:.55' : '' },
      h('div', { class: 'head-row' },
        h('div', {}, h('strong', {}, s.code), ` · ${s.staffName ?? 'non attribuées'} · ${s.rooms} chambre(s)`, h('div', { class: 'hint' }, STATUS[s.status])),
        h('div', { class: 'acts' },
          editor && s.status !== 'cancelled' ? h('a', { class: 'sm', href: `/admin/hotel/fiches/imprimer/?id=${s.id}` }, 'Imprimer') : null,
          open ? photoButton(s) : null,
          editor && open ? h('button', { class: 'btn', type: 'button', onclick: () => void openSheet(s.id) }, 'Contrôler et valider') : null,
          editor && open ? h('button', { class: 'sm', type: 'button', onclick: async () => {
            if (!confirm(`Annuler la fiche ${s.code} ?`)) return;
            const x = await api('DELETE', `/api/hotel/sheets/${s.id}`);
            if (!x.ok) flash(x.data.error || 'Annulation impossible.'); else { flash('Fiche annulée.', true); $('sh-detail').hidden = true; await load(); }
          } }, 'Annuler') : null))));
  }
}

async function openSheet(id: number) {
  const r = await api<{ sheet: Detail }>('GET', `/api/hotel/sheets/${id}`);
  const box = $('sh-detail');
  if (!r.ok) { flash(r.data.error || 'Lecture impossible.'); return; }
  const s = r.data.sheet;
  box.hidden = false;
  box.textContent = '';
  const parsed = s.read?.status === 'read' ? s.read.parsed : null;
  const usable = Boolean(parsed?.codeMatches);
  const byTask = new Map((parsed?.rows ?? []).map((x) => [x.taskId, x]));

  const intro: HTMLElement[] = [h('h3', { style: 'margin-top:0' }, `Fiche ${s.code} — ${s.staffName ?? 'chambres non attribuées'}`)];
  if (s.read?.status === 'failed') intro.push(h('p', { class: 'err' }, s.read.error || 'La lecture a échoué : saisissez la fiche à la main.'));
  if (parsed) for (const p of parsed.problems) intro.push(h('p', { class: 'err' }, p));
  if (parsed && usable) intro.push(h('p', { class: 'hint' }, 'Les lignes en jaune sont à vérifier : cochez « Confirmé » après les avoir comparées avec la photo. Les cases préremplies viennent de la lecture : rien n’est appliqué avant votre validation.'));
  if (!s.fileId) intro.push(h('p', { class: 'hint' }, 'Pas de photo : saisissez ce que dit la fiche papier.'));
  box.appendChild(h('div', {}, intro));
  if (s.fileId) box.appendChild(h('p', {}, h('a', { href: `/api/hotel/files/${s.fileId}`, target: '_blank', rel: 'noopener' }, h('img', { class: 'rv-photo', src: `/api/hotel/files/${s.fileId}`, alt: `Photo de la fiche ${s.code}` }))));

  type Ctl = { taskId: number; done: HTMLSelectElement; counts: [number, HTMLInputElement][]; note: HTMLInputElement; confirm: HTMLInputElement | null; row: Row };
  const ctls: Ctl[] = [];
  const body = h('div', {});
  for (const row of s.rows) {
    const rd = usable ? byTask.get(row.taskId) : undefined;
    const flags = rd?.flags ?? [];
    const flagged = flags.length > 0;
    const done = h('select', { 'aria-label': `Chambre ${row.roomNumber} faite` },
      h('option', { value: '' }, '— choisir —'), h('option', { value: 'yes' }, 'Faite'), h('option', { value: 'no' }, 'Non faite')) as HTMLSelectElement;
    if (rd && rd.done !== null) done.value = rd.done ? 'yes' : 'no';
    const counts: Ctl['counts'] = row.minibar.map((it) => {
      const given = rd?.minibar.find((m) => m.itemId === it.itemId);
      const inp = h('input', { type: 'number', min: '0', max: '99', inputmode: 'numeric', value: given && given.count !== null ? String(given.count) : '', 'aria-label': `${it.name}, chambre ${row.roomNumber}` }) as HTMLInputElement;
      return [it.itemId, inp];
    });
    const note = h('input', { type: 'text', maxlength: '300', value: rd?.note ?? '', 'aria-label': `Remarque, chambre ${row.roomNumber}` }) as HTMLInputElement;
    const confirm = flagged ? (h('input', { type: 'checkbox' }) as HTMLInputElement) : null;
    ctls.push({ taskId: row.taskId, done, counts, note, confirm, row });
    body.appendChild(h('div', { class: `item rv-room${flagged ? ' rv-flag' : ''}` },
      h('div', { class: 'head-row' }, h('div', {}, h('strong', {}, `Chambre ${row.roomNumber}`), h('span', { class: 'hint' }, ` · ${row.kind === 'depart' ? 'Départ' : 'Recouche'}`)), done),
      row.minibar.length ? h('div', {}, h('div', { class: 'hint' }, 'Minibar : ce qui reste (vide = non compté)'), row.minibar.map((it, i) => h('label', { class: 'rv-mb' }, it.name, counts[i][1]))) : null,
      h('label', { class: 'rv-note' }, 'Remarque', note),
      flagged ? h('div', { class: 'rv-flag-note' }, `À vérifier : ${flags.join(' ; ')}`) : null,
      confirm ? h('label', { class: 'rv-flag-note' }, confirm, ' Confirmé après vérification') : null));
  }
  box.appendChild(body);
  box.appendChild(h('div', { class: 'acts' },
    h('button', { class: 'btn', type: 'button', onclick: async (ev) => {
      const btn = ev.currentTarget as HTMLButtonElement;
      for (const c of ctls) {
        if (!c.done.value) { flash(`Chambre ${c.row.roomNumber} : indiquez si le ménage est fait.`); c.done.focus(); return; }
        if (c.confirm && !c.confirm.checked) { flash(`Chambre ${c.row.roomNumber} : lecture douteuse, cochez « Confirmé » après vérification.`); c.confirm.focus(); return; }
      }
      const rows = ctls.map((c) => ({
        taskId: c.taskId, done: c.done.value === 'yes', note: c.note.value,
        minibar: c.counts.filter(([, el]) => el.value.trim() !== '').map(([itemId, el]) => ({ itemId, counted: Number(el.value) })),
      }));
      btn.disabled = true;
      const x = await api<{ applied?: number; failures?: { roomNumber: string; error: string }[] }>('POST', `/api/hotel/sheets/${s.id}/validate`, { rows, reviewed: ctls.filter((c) => c.confirm?.checked).map((c) => c.taskId) });
      btn.disabled = false;
      if (!x.ok && x.status !== 207) { flash(x.data.error || 'Validation impossible.'); return; }
      const fails = x.data.failures ?? [];
      if (fails.length) flash(`Partiellement appliquée : ${fails.map((f) => `chambre ${f.roomNumber} (${f.error})`).join(' ; ')}. Corrigez puis validez à nouveau : ce qui est fait ne sera pas refait.`);
      else { flash(`Fiche ${s.code} validée : ${x.data.applied} chambre(s) mises à jour.`, true); box.hidden = true; }
      await load();
    } }, 'Valider la fiche'),
    h('button', { class: 'sm', type: 'button', onclick: () => { box.hidden = true; } }, 'Fermer')));
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

dateEl.addEventListener('change', () => { $('sh-detail').hidden = true; void load(); });
$('sh-new').addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = $<HTMLSelectElement>('sh-staff').value;
  const r = await api<{ id: number }>('POST', '/api/hotel/sheets', { date: dateEl.value, staffId: v === '' ? null : Number(v) });
  if (!r.ok) { flash(r.data.error || 'Création impossible.'); return; }
  flash('Fiche créée : imprimez-la.', true);
  await load();
});
void load();
