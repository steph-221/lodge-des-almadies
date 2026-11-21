import { api } from '../api';
import { h } from '../dom';
import { shrink } from '../image';
import { fmtDate } from './labels';

type Point = { id: number; label: string; zone: string; service: 'housekeeping' | 'maintenance'; active: boolean };
type QueueItem = { roomId: number; number: string; building: string; typeLabel: string | null; lastVisit: string | null };
type Defect = { id: number; roomNumber: string; label: string; zone: string; comment: string; service: 'housekeeping' | 'maintenance'; visitedAt: string; fixedAt: string | null; fixedByName: string | null };
type Visit = { id: number; roomNumber: string; at: string; staffName: string | null; overall: number | null; comment: string; items: { label: string; zone: string; result: string; comment: string; service: string | null; fixedAt: string | null }[]; photos: number[] };

const root = document.getElementById('visits-app')!;
const director = root.dataset.director === '1';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const msg = $('v-msg');
const flash = (text: string, ok = false) => { msg.textContent = text; msg.className = ok ? 'ok' : 'err'; };
const SERVICE = { housekeeping: 'Ménage', maintenance: 'Technique' } as const;
const fmtDt = (iso: string) => { const d = new Date(iso); return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };

// ---- Défauts (tous les rôles de cet écran) ----
const svcSel = document.getElementById('d-service') as HTMLSelectElement | null;
const allBox = document.getElementById('d-all') as HTMLInputElement | null;
async function loadDefects() {
  const qs = new URLSearchParams({ view: 'defects' });
  if (svcSel?.value) qs.set('service', svcSel.value);
  if (allBox?.checked) qs.set('all', '1');
  const r = await api<{ defects: Defect[] }>('GET', `/api/hotel/inspections?${qs}`);
  const box = $('d-list');
  box.textContent = '';
  if (!r.ok) { flash(r.data.error || 'Lecture impossible.'); return; }
  if (!r.data.defects.length) { box.appendChild(h('p', { class: 'hint' }, 'Aucun défaut à corriger.')); return; }
  for (const d of r.data.defects) {
    box.appendChild(h('div', { class: 'item', style: d.fixedAt ? 'opacity:.6' : '' },
      h('div', { class: 'head-row' },
        h('div', {}, h('strong', {}, `Chambre ${d.roomNumber}`), ' · ', d.zone ? `${d.zone} · ` : '', d.label,
          h('div', { class: 'hint' }, `${SERVICE[d.service]} · vu le ${fmtDt(d.visitedAt)}${d.fixedAt ? ` · corrigé le ${fmtDt(d.fixedAt)}${d.fixedByName ? ` par ${d.fixedByName}` : ''}` : ''}`)),
        h('button', { class: d.fixedAt ? 'sm' : 'btn', type: 'button', onclick: async () => {
          const x = await api('PATCH', `/api/hotel/inspections/defects/${d.id}`, { fixed: !d.fixedAt });
          if (!x.ok) flash(x.data.error || 'Enregistrement impossible.'); else { flash(d.fixedAt ? 'Défaut rouvert.' : 'Défaut marqué corrigé.', true); await loadDefects(); }
        } }, d.fixedAt ? 'Rouvrir' : 'Corrigé')),
      d.comment ? h('p', { style: 'margin:6px 0 0' }, d.comment) : null));
  }
}
svcSel?.addEventListener('change', loadDefects);
allBox?.addEventListener('change', loadDefects);

if (director) {
  let points: Point[] = [];
  let storage: string | null = null;
  let visitRoom: number | null = null;

  // ---- Liste du matin ----
  const qDate = $<HTMLInputElement>('q-date');
  qDate.value = new Date().toISOString().slice(0, 10);
  async function loadQueue() {
    const r = await api<{ queue: QueueItem[]; perMorning: number; doneToday: number; free: number; storage: string | null }>('GET', `/api/hotel/inspections?view=queue&date=${qDate.value}`);
    const box = $('q-list');
    box.textContent = '';
    if (!r.ok) { flash(r.data.error || 'Lecture impossible.'); return; }
    storage = r.data.storage;
    $('q-sub').textContent = `${r.data.perMorning} visite(s) par matin, ${r.data.doneToday} déjà faite(s) ce jour-là, ${r.data.free} chambre(s) libre(s) ce jour-là.`;
    if (!r.data.queue.length) { box.appendChild(h('p', { class: 'hint' }, r.data.perMorning ? 'Rien à visiter : quota atteint ou aucune chambre libre.' : 'Les visites automatiques sont à 0 : réglez-les dans la grille de contrôle.')); return; }
    for (const q of r.data.queue) {
      box.appendChild(h('div', { class: 'item' }, h('div', { class: 'head-row' },
        h('div', {}, h('strong', {}, `Chambre ${q.number}`), h('div', { class: 'hint' }, `${q.building ? q.building + ' · ' : ''}${q.typeLabel ?? 'type non défini'} · ${q.lastVisit ? `dernière visite le ${fmtDate(q.lastVisit)}` : 'jamais visitée'}`)),
        h('button', { class: 'btn', type: 'button', onclick: () => openVisit(q.roomId) }, 'Visiter'))));
    }
  }
  qDate.addEventListener('change', loadQueue);

  // ---- Formulaire de visite ----
  const form = $<HTMLFormElement>('visit-form');
  const roomSel = $<HTMLSelectElement>('visit-room');
  const photos = $<HTMLInputElement>('visit-photos');
  const results = new Map<number, { result: string; comment: HTMLInputElement; service: HTMLSelectElement }>();

  function renderPoints() {
    const box = $('visit-points');
    box.textContent = '';
    results.clear();
    const active = points.filter((p) => p.active);
    if (!active.length) { box.appendChild(h('p', { class: 'hint' }, 'Aucun point de contrôle : ajoutez-en dans la grille plus bas. Vous pouvez quand même enregistrer une note et des photos.')); return; }
    let zone: string | null = null;
    for (const p of active) {
      if (p.zone !== zone) { zone = p.zone; box.appendChild(h('h4', { style: 'margin:14px 0 4px' }, zone || 'Autres points')); }
      const comment = h('input', { maxlength: '500', placeholder: 'Décrivez le défaut', hidden: true }) as HTMLInputElement;
      const service = h('select', { hidden: true }, h('option', { value: 'housekeeping' }, 'Ménage'), h('option', { value: 'maintenance' }, 'Technique')) as HTMLSelectElement;
      service.value = p.service;
      const state = { result: 'ok', comment, service };
      results.set(p.id, state);
      const radio = (value: string, label: string) => h('label', { class: 'check' },
        h('input', { type: 'radio', name: `pt-${p.id}`, value, checked: value === 'ok', onchange: () => { state.result = value; comment.hidden = service.hidden = value !== 'fix'; } }), label);
      box.appendChild(h('div', { class: 'item' }, h('strong', {}, p.label),
        h('div', { class: 'acts' }, radio('ok', 'Conforme'), radio('fix', 'À corriger'), radio('na', 'Sans objet')),
        h('div', { class: 'acts' }, comment, service)));
    }
  }

  function openVisit(roomId: number | null) {
    visitRoom = roomId;
    form.reset();
    if (roomId) roomSel.value = String(roomId);
    renderPoints();
    photos.disabled = storage === null;
    $('visit-photos-hint').textContent = storage === null ? 'Le stockage des photos (Google Drive) n’est pas encore configuré : la visite s’enregistre sans photo.' : storage === 'local' ? 'Mode développement : les photos restent sur cet ordinateur.' : '';
    $('visit-title').textContent = roomId ? `Visite de la chambre ${roomSel.selectedOptions[0]?.textContent ?? ''}` : 'Nouvelle visite';
    $('visit-card').hidden = false;
    $('visit-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('visit-cancel').addEventListener('click', () => { $('visit-card').hidden = true; });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const files = [...(photos.files ?? [])].slice(0, 4);
    if ((photos.files?.length ?? 0) > 4) { flash('4 photos au plus : seules les 4 premières seront envoyées.'); }
    const items = [...results].map(([pointId, s]) => ({ pointId, result: s.result, comment: s.comment.value, service: s.service.value }));
    const r = await api<{ id: number }>('POST', '/api/hotel/inspections', { roomId: Number(fd.get('roomId')), overall: fd.get('overall'), comment: fd.get('comment'), items });
    if (!r.ok) { flash(r.data.error || 'Enregistrement impossible.'); return; }
    let failed = 0;
    for (const f of files) {
      try {
        const blob = await shrink(f);
        const up = await fetch(`/api/hotel/inspections/${r.data.id}/photos`, { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: blob });
        if (!up.ok) failed++;
      } catch { failed++; }
    }
    const defects = items.filter((i) => i.result === 'fix').length;
    flash(`Visite enregistrée${defects ? `, ${defects} défaut(s) à corriger` : ''}${failed ? `. ${failed} photo(s) non envoyée(s).` : '.'}`, !failed);
    $('visit-card').hidden = true;
    visitRoom = null;
    await Promise.all([loadQueue(), loadDefects(), loadHistory()]);
  });

  // ---- Historique ----
  const hRoom = $<HTMLSelectElement>('h-room');
  async function loadHistory() {
    const r = await api<{ visits: Visit[] }>('GET', `/api/hotel/inspections?view=history${hRoom.value ? `&roomId=${hRoom.value}` : ''}`);
    const box = $('h-list');
    box.textContent = '';
    if (!r.ok) { flash(r.data.error || 'Lecture impossible.'); return; }
    if (!r.data.visits.length) { box.appendChild(h('p', { class: 'hint' }, 'Aucune visite enregistrée.')); return; }
    for (const v of r.data.visits) {
      const fixes = v.items.filter((i) => i.result === 'fix');
      box.appendChild(h('div', { class: 'item' },
        h('div', { class: 'task-head' }, h('strong', {}, `Chambre ${v.roomNumber}`), v.overall ? h('span', { class: 'pill' }, `${v.overall} / 5`) : null,
          h('span', { class: 'hint' }, `${fmtDt(v.at)}${v.staffName ? ` · ${v.staffName}` : ''} · ${fixes.length ? `${fixes.length} à corriger` : 'rien à signaler'}`)),
        v.comment ? h('p', { style: 'margin:6px 0 0' }, v.comment) : null,
        fixes.length ? h('ul', {}, fixes.map((i) => h('li', {}, `${i.zone ? i.zone + ' · ' : ''}${i.label} : ${i.comment}${i.fixedAt ? ' (corrigé)' : ''}`))) : null,
        v.photos.length ? h('div', { class: 'acts' }, v.photos.map((id) => h('a', { href: `/api/hotel/files/${id}`, target: '_blank', rel: 'noopener' },
          h('img', { src: `/api/hotel/files/${id}`, alt: `Photo de la chambre ${v.roomNumber}`, loading: 'lazy', style: 'width:96px;height:72px;object-fit:cover;border-radius:8px' })))) : null));
    }
  }
  hRoom.addEventListener('change', loadHistory);

  // ---- Grille de contrôle ----
  const SUGGESTED = [
    ['Chambre', 'Literie (draps, oreillers, couvre-lit)', 'housekeeping'], ['Chambre', 'Propreté du sol et des surfaces', 'housekeeping'], ['Chambre', 'Mobilier (état, stabilité)', 'maintenance'],
    ['Chambre', 'Peinture et murs', 'maintenance'], ['Chambre', 'Climatisation', 'maintenance'], ['Chambre', 'Télévision et télécommande', 'maintenance'], ['Chambre', 'Coffre', 'maintenance'], ['Chambre', 'Minibar', 'housekeeping'],
    ['Salle de bain', 'Propreté (douche, lavabo, WC)', 'housekeeping'], ['Salle de bain', 'Plomberie et évacuations', 'maintenance'], ['Salle de bain', 'Serviettes et produits d’accueil', 'housekeeping'],
    ['Extérieur', 'Terrasse ou balcon', 'housekeeping'], ['Extérieur', 'Porte, serrure et fenêtres', 'maintenance'],
  ] as const;

  async function loadPoints() {
    const r = await api<{ points: Point[]; perMorning: number }>('GET', '/api/hotel/inspections?view=points');
    if (!r.ok) { flash(r.data.error || 'Lecture impossible.'); return; }
    points = r.data.points;
    $<HTMLInputElement>('per-morning').value = String(r.data.perMorning);
    const body = $('pt-body');
    body.textContent = '';
    if (!points.length) body.appendChild(h('tr', {}, h('td', { colspan: '4', class: 'hint' }, 'Aucun point. Ajoutez-en un ou utilisez « Ajouter les points habituels ».')));
    for (const p of points) {
      body.appendChild(h('tr', { class: p.active ? '' : 'off' }, h('td', {}, p.zone || '—'), h('td', {}, p.label), h('td', {}, SERVICE[p.service]),
        h('td', {}, h('button', { class: 'sm', type: 'button', onclick: async () => {
          const x = await api('PATCH', `/api/hotel/inspections/points/${p.id}`, { label: p.label, zone: p.zone, service: p.service, active: !p.active });
          if (!x.ok) flash(x.data.error || 'Enregistrement impossible.'); else await loadPoints();
        } }, p.active ? 'Désactiver' : 'Réactiver'))));
    }
  }
  $<HTMLInputElement>('per-morning').addEventListener('change', async (e) => {
    const r = await api('PUT', '/api/hotel/inspections/points', { perMorning: (e.target as HTMLInputElement).value });
    if (!r.ok) flash(r.data.error || 'Enregistrement impossible.'); else { flash('Réglage enregistré.', true); await loadQueue(); }
  });
  const ptForm = $<HTMLFormElement>('pt-form');
  ptForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(ptForm);
    const r = await api('POST', '/api/hotel/inspections/points', { label: fd.get('label'), zone: fd.get('zone'), service: fd.get('service') });
    if (!r.ok) { flash(r.data.error || 'Enregistrement impossible.'); return; }
    ptForm.reset(); flash('Point ajouté.', true); await loadPoints();
  });
  $('pt-suggest').addEventListener('click', async () => {
    if (points.length && !confirm('Des points existent déjà : ajouter aussi les points habituels ?')) return;
    const r = await api('POST', '/api/hotel/inspections/points', { points: SUGGESTED.map(([zone, label, service]) => ({ zone, label, service })) });
    if (!r.ok) flash(r.data.error || 'Enregistrement impossible.'); else { flash('Points habituels ajoutés : désactivez ou ajoutez ce qui ne vous convient pas.', true); await loadPoints(); }
  });

  // ---- Chambres (formulaire et filtre d'historique) ----
  void api<{ rooms: { id: number; number: string; active: boolean; typeLabel: string | null }[] }>('GET', '/api/hotel/rooms').then((r) => {
    if (!r.ok) return;
    const active = r.data.rooms.filter((x) => x.active);
    roomSel.appendChild(h('option', { value: '' }, active.length ? 'Choisir…' : 'Aucune chambre'));
    active.forEach((x) => { roomSel.appendChild(h('option', { value: String(x.id) }, x.number)); hRoom.appendChild(h('option', { value: String(x.id) }, x.number)); });
  });
  void (async () => { await loadPoints(); await Promise.all([loadQueue(), loadHistory()]); })();
  void visitRoom;
}

void loadDefects();
