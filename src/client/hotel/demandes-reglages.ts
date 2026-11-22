import qrcode from 'qrcode-generator';
import { api } from '../api';
import { h } from '../dom';

type Cat = { id: number; labelFr: string; labelEn: string; kind: 'service' | 'room_service'; service: string; price: number | null; askNote: boolean; active: boolean; sort: number };
type Guide = { id: number; titleFr: string; titleEn: string; bodyFr: string; bodyEn: string; occupiedOnly: boolean; active: boolean; sort: number };

const root = document.getElementById('st-app')!;
const director = root.dataset.director === '1';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const msg = $('st-msg');
const flash = (text: string, ok = false) => { msg.textContent = text; msg.className = 'hint ' + (ok ? 'ok' : 'err'); };
const SERVICE: Record<string, string> = { reception: 'Réception', housekeeping: 'Ménage', technique: 'Technique', restaurant: 'Restaurant' };
const fcfa = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`;

// Remplit un formulaire à partir d'un objet (cases à cocher comprises), et le relit.
function fill(form: HTMLFormElement, v: Record<string, unknown>) {
  for (const el of Array.from(form.elements) as (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[]) {
    if (!el.name || !(el.name in v)) continue;
    if ((el as HTMLInputElement).type === 'checkbox') (el as HTMLInputElement).checked = Boolean(v[el.name]);
    else el.value = v[el.name] == null ? '' : String(v[el.name]);
  }
}
const checked = (form: HTMLFormElement, name: string) => (form.elements.namedItem(name) as HTMLInputElement).checked;
const val = (form: HTMLFormElement, name: string) => (form.elements.namedItem(name) as HTMLInputElement).value;

// ---------- Catalogue ----------
const catForm = $<HTMLFormElement>('cat-form');
let cats: Cat[] = [];

function resetCat() { catForm.reset(); (catForm.elements.namedItem('id') as HTMLInputElement).value = ''; $('cat-save').textContent = 'Ajouter'; $('cat-cancel').hidden = true; }

async function loadCat() {
  const r = await api<{ items: Cat[] }>('GET', '/api/hotel/request-catalog');
  const box = $('cat-list');
  if (!r.ok) { flash(r.data.error || 'Lecture du catalogue impossible.'); return; }
  cats = r.data.items;
  box.textContent = '';
  if (!cats.length) { box.appendChild(h('p', { class: 'hint' }, 'Le catalogue est vide : ajoutez une demande ci-dessous, ou utilisez « Ajouter les demandes courantes ».')); return; }
  box.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' }, h('tbody', {}, cats.map((c) => h('tr', { class: c.active ? '' : 'off' },
    h('td', {}, h('strong', {}, c.labelFr), c.labelEn ? h('div', { class: 'hint' }, c.labelEn) : h('div', { class: 'hint' }, 'sans traduction anglaise')),
    h('td', {}, SERVICE[c.service] ?? c.service, c.kind === 'room_service' ? h('div', { class: 'hint' }, `Room service${c.price !== null ? ` · ${fcfa(c.price)}` : ''}`) : null),
    h('td', {}, c.askNote ? h('span', { class: 'pill' }, 'Précision exigée') : null, c.active ? null : h('span', { class: 'pill off' }, 'Masquée')),
    h('td', { class: 'acts' },
      h('button', { class: 'sm', type: 'button', onclick: () => { fill(catForm, { ...c, id: c.id }); $('cat-save').textContent = 'Enregistrer'; $('cat-cancel').hidden = false; catForm.scrollIntoView({ behavior: 'smooth' }); } }, 'Modifier'),
      h('button', { class: 'sm', type: 'button', onclick: async () => { await saveCat({ ...c, active: !c.active }, c.id); } }, c.active ? 'Masquer' : 'Afficher'))))))));
}

async function saveCat(body: Record<string, unknown>, id: number | null): Promise<boolean> {
  const r = id ? await api('PATCH', `/api/hotel/request-catalog/${id}`, body) : await api('POST', '/api/hotel/request-catalog', body);
  if (!r.ok) { flash(r.data.error || 'Enregistrement impossible.'); return false; }
  flash('Catalogue enregistré.', true);
  await loadCat();
  return true;
}

catForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = Number(val(catForm, 'id')) || null;
  const ok = await saveCat({
    labelFr: val(catForm, 'labelFr'), labelEn: val(catForm, 'labelEn'), service: val(catForm, 'service'), kind: val(catForm, 'kind'),
    price: val(catForm, 'price'), sort: val(catForm, 'sort'), askNote: checked(catForm, 'askNote'), active: checked(catForm, 'active'),
  }, id);
  if (ok) resetCat();
});
$('cat-cancel').addEventListener('click', resetCat);

// Demandes courantes d'un hôtel : proposition à valider, modifiable ensuite. Les prix et le room service viennent de la carte de l'hôtel.
const STARTER: Partial<Cat>[] = [
  { labelFr: 'Oreiller supplémentaire', labelEn: 'Extra pillow', service: 'housekeeping' },
  { labelFr: 'Couverture supplémentaire', labelEn: 'Extra blanket', service: 'housekeeping' },
  { labelFr: 'Serviettes supplémentaires', labelEn: 'Extra towels', service: 'housekeeping' },
  { labelFr: 'Fer à repasser', labelEn: 'Iron', service: 'housekeeping' },
  { labelFr: 'Passage du linge à la blanchisserie', labelEn: 'Laundry pick-up', service: 'housekeeping' },
  { labelFr: 'Aide télévision, Wi-Fi ou climatisation', labelEn: 'Help with TV, Wi-Fi or air conditioning', service: 'technique', askNote: true },
  { labelFr: 'Coffre-fort bloqué', labelEn: 'Safe locked', service: 'reception' },
  { labelFr: 'Taxi (précisez l’heure et la destination)', labelEn: 'Taxi (please give time and destination)', service: 'reception', askNote: true },
  { labelFr: 'Réveil (précisez l’heure)', labelEn: 'Wake-up call (please give the time)', service: 'reception', askNote: true },
];
$('cat-starter').addEventListener('click', async () => {
  const have = new Set(cats.map((c) => c.labelFr.toLowerCase()));
  const todo = STARTER.filter((s) => !have.has((s.labelFr ?? '').toLowerCase()));
  if (!todo.length) { flash('Les demandes courantes sont déjà dans le catalogue.', true); return; }
  if (!confirm(`Ajouter ${todo.length} demande(s) courante(s) ? Vous pourrez les modifier ou les masquer ensuite.`)) return;
  for (const [i, s] of todo.entries()) {
    const r = await api('POST', '/api/hotel/request-catalog', { ...s, kind: 'service', sort: i * 10, askNote: s.askNote === true });
    if (!r.ok) { flash(r.data.error || 'Ajout interrompu.'); break; }
  }
  flash('Demandes courantes ajoutées.', true);
  await loadCat();
});

// ---------- Guide ----------
const gdForm = $<HTMLFormElement>('gd-form');
function resetGd() { gdForm.reset(); (gdForm.elements.namedItem('id') as HTMLInputElement).value = ''; $('gd-save').textContent = 'Ajouter'; $('gd-cancel').hidden = true; }

async function loadGd() {
  const r = await api<{ items: Guide[] }>('GET', '/api/hotel/guide');
  const box = $('gd-list');
  if (!r.ok) { flash(r.data.error || 'Lecture du guide impossible.'); return; }
  box.textContent = '';
  if (!r.data.items.length) { box.appendChild(h('p', { class: 'hint' }, 'Aucune rubrique : ajoutez le Wi-Fi, les chaînes TV, les horaires, les numéros utiles.')); return; }
  box.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' }, h('tbody', {}, r.data.items.map((g) => h('tr', { class: g.active ? '' : 'off' },
    h('td', {}, h('strong', {}, g.titleFr), h('div', { class: 'hint' }, g.titleEn || 'sans traduction anglaise')),
    h('td', {}, g.occupiedOnly ? h('span', { class: 'pill' }, 'Chambre occupée seulement') : h('span', { class: 'pill' }, 'Toujours visible'), g.active ? null : h('span', { class: 'pill off' }, 'Masquée')),
    h('td', { class: 'acts' },
      h('button', { class: 'sm', type: 'button', onclick: () => { fill(gdForm, { ...g }); $('gd-save').textContent = 'Enregistrer'; $('gd-cancel').hidden = false; gdForm.scrollIntoView({ behavior: 'smooth' }); } }, 'Modifier'),
      h('button', { class: 'sm', type: 'button', onclick: async () => {
        const d = await api('PATCH', `/api/hotel/guide/${g.id}`, { ...g, active: !g.active });
        if (!d.ok) flash(d.data.error || 'Enregistrement impossible.'); else { flash('Guide enregistré.', true); await loadGd(); }
      } }, g.active ? 'Masquer' : 'Afficher'))))))));
}

gdForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = Number(val(gdForm, 'id')) || null;
  const body = {
    titleFr: val(gdForm, 'titleFr'), titleEn: val(gdForm, 'titleEn'), bodyFr: val(gdForm, 'bodyFr'), bodyEn: val(gdForm, 'bodyEn'),
    sort: val(gdForm, 'sort'), occupiedOnly: checked(gdForm, 'occupiedOnly'), active: checked(gdForm, 'active'),
  };
  const r = id ? await api('PATCH', `/api/hotel/guide/${id}`, body) : await api('POST', '/api/hotel/guide', body);
  if (!r.ok) { flash(r.data.error || 'Enregistrement impossible.'); return; }
  flash('Guide enregistré.', true);
  resetGd();
  await loadGd();
});
$('gd-cancel').addEventListener('click', resetGd);

// ---------- Alertes e-mail (direction) ----------
async function loadAlerts() {
  const r = await api<{ value: Record<string, string[]>; whatsapp: Record<string, string[]>; mailReady: boolean; whatsappReady: boolean }>('GET', '/api/hotel/alerts');
  if (!r.ok) { flash(r.data.error || 'Lecture des alertes impossible.'); return; }
  const f = $<HTMLFormElement>('al-form');
  for (const [k, list] of Object.entries(r.data.value)) (f.elements.namedItem(k) as HTMLTextAreaElement).value = list.join('\n');
  for (const [k, list] of Object.entries(r.data.whatsapp || {})) (f.elements.namedItem(`wa_${k}`) as HTMLTextAreaElement).value = list.join('\n');
  $('al-state').textContent = `E-mail : ${r.data.mailReady ? 'configuré' : 'non configuré'} · WhatsApp : ${r.data.whatsappReady ? 'configuré' : 'non configuré'}. Un canal non configuré conserve les saisies mais n’envoie rien.`;
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const services = ['reception', 'housekeeping', 'technique', 'restaurant'];
    const body = {
      ...Object.fromEntries(services.map((k) => [k, val(f, k)])),
      whatsapp: Object.fromEntries(services.map((k) => [k, val(f, `wa_${k}`)])),
    };
    const d = await api('PUT', '/api/hotel/alerts', body);
    flash(d.ok ? 'Adresses et numéros enregistrés.' : d.data.error || 'Enregistrement impossible.', d.ok);
  }, { once: false });
}

// ---------- QR codes (direction) ----------
const QR_TEXT = { fr: 'Une demande ? Scannez ce code', en: 'Need something? Scan this code' };

function sheet(items: { number: string; url: string }[]) {
  const box = $('qr-sheet');
  box.hidden = false;
  box.textContent = '';
  box.appendChild(h('div', { class: 'no-print acts' },
    h('button', { class: 'btn', type: 'button', onclick: () => window.print() }, 'Imprimer'),
    h('span', { class: 'hint' }, 'Découpez chaque carte et posez-la dans la chambre. Ces adresses ne seront plus affichables : régénérez au besoin.')));
  const grid = h('div', { class: 'qr-grid' });
  for (const it of items) {
    const qr = qrcode(0, 'M');
    qr.addData(it.url);
    qr.make();
    const svg = h('div', { class: 'qr-svg' });
    svg.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); // SVG produit par la bibliothèque à partir de notre adresse
    grid.appendChild(h('div', { class: 'qr-card' },
      h('div', { class: 'qr-room' }, `Chambre ${it.number}`), svg,
      h('div', {}, QR_TEXT.fr), h('div', { class: 'hint' }, QR_TEXT.en)));
  }
  box.appendChild(grid);
  box.scrollIntoView({ behavior: 'smooth' });
}

async function generate(roomIds: number[] | 'all', label: string) {
  if (!confirm(`Générer ${label} ? Les anciens QR de ces chambres cesseront de fonctionner.`)) return;
  const r = await api<{ items: { number: string; url: string }[] }>('POST', '/api/hotel/room-tokens', roomIds === 'all' ? { all: true } : { roomIds });
  if (!r.ok) { flash(r.data.error || 'Génération impossible.'); return; }
  flash(`${r.data.items.length} QR code(s) généré(s).`, true);
  sheet(r.data.items);
  await loadQr();
}

async function loadQr() {
  const r = await api<{ rooms: { roomId: number; number: string; hasToken: boolean; since: string | null }[]; origin: string }>('GET', '/api/hotel/room-tokens');
  if (!r.ok) { flash(r.data.error || 'Lecture des QR impossible.'); return; }
  $('qr-origin').textContent = `Adresse encodée dans les QR : ${r.data.origin}/c/… (pour fixer l’adresse définitive, définissez la variable PUBLIC_APP_ORIGIN avant d’imprimer).`;
  const box = $('qr-status');
  box.textContent = '';
  box.appendChild(h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' }, h('tbody', {}, r.data.rooms.map((x) => h('tr', {},
    h('td', {}, h('strong', {}, `Chambre ${x.number}`)),
    h('td', {}, x.hasToken ? h('span', { class: 'pill' }, `QR actif depuis le ${new Date(x.since!).toLocaleDateString('fr-FR')}`) : h('span', { class: 'pill off' }, 'Pas de QR')),
    h('td', { class: 'acts' }, h('button', { class: 'sm', type: 'button', onclick: () => generate([x.roomId], `le QR de la chambre ${x.number}`) }, x.hasToken ? 'Régénérer' : 'Générer'))))))));
}

void loadCat();
void loadGd();
if (director) {
  void loadAlerts();
  void loadQr();
  $('qr-all').addEventListener('click', () => generate('all', 'les QR de toutes les chambres'));
}
