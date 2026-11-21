// Bloc d'import réutilisable : choix d'un fichier ou collage, association des colonnes, contrôle puis import.
import { api } from '../api';
import { h } from '../dom';
import { parseTable, type Table } from '../../lib/hotel/csv';
import { guessMapping, type FieldDef } from '../../lib/hotel/import';

type Opts = { kind: 'rooms' | 'stays' | 'items'; fields: FieldDef[]; template: string; templateName: string; onDone: () => void };

// Les exports Excel français sont souvent en Windows-1252 : on essaie UTF-8 d'abord, puis on se rabat dessus.
async function readText(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1252').decode(buf); }
}

export function mountImport(box: HTMLElement, o: Opts): void {
  let table: Table | null = null;
  const msg = h('p', { role: 'status', class: 'hint' });
  const mapBox = h('div');
  const result = h('div', { 'aria-live': 'polite' });
  const paste = h('textarea', { placeholder: 'Collez ici le contenu copié depuis Excel, ou choisissez un fichier ci-dessous.', rows: '5' }) as HTMLTextAreaElement;
  const file = h('input', { type: 'file', accept: '.csv,.txt,.tsv,text/csv,text/plain' }) as HTMLInputElement;
  const selects: Record<string, HTMLSelectElement> = {};

  const say = (t: string, cls = 'hint') => { msg.textContent = t; msg.className = cls; };

  function load(text: string) {
    result.textContent = '';
    const t = parseTable(text);
    if (!t.headers.length || !t.rows.length) { table = null; mapBox.textContent = ''; say('Aucune ligne trouvée : la première ligne doit contenir les titres des colonnes.', 'err'); return; }
    table = t;
    const guess = guessMapping(t.headers, o.fields);
    mapBox.textContent = '';
    const grid = h('div', { class: 'row' });
    for (const f of o.fields) {
      const sel = h('select', {}, h('option', { value: '-1' }, '— ignorer —'),
        t.headers.map((hd, i) => h('option', { value: String(i), selected: guess[f.key] === i }, hd || `Colonne ${i + 1}`))) as HTMLSelectElement;
      sel.value = String(guess[f.key]);
      selects[f.key] = sel;
      grid.appendChild(h('label', {}, f.label + (f.required ? ' *' : ''), sel));
    }
    mapBox.append(
      h('p', {}, `${t.rows.length} ligne(s) lues. Vérifiez à quelle colonne correspond chaque information :`),
      grid,
      h('div', { class: 'acts' },
        h('button', { class: 'sm', type: 'button', onclick: () => send(true) }, 'Contrôler sans importer'),
        h('button', { class: 'btn', type: 'button', onclick: () => send(false) }, 'Importer')),
    );
    say('');
  }

  async function send(dryRun: boolean) {
    if (!table) return;
    const mapping: Record<string, number> = {};
    for (const f of o.fields) mapping[f.key] = Number(selects[f.key].value);
    const missing = o.fields.filter((f) => f.required && mapping[f.key] < 0).map((f) => f.label);
    if (missing.length) { say(`Colonne à choisir : ${missing.join(', ')}.`, 'err'); return; }
    say(dryRun ? 'Contrôle en cours…' : 'Import en cours…');
    const r = await api<Record<string, unknown>>('POST', o.kind === 'items' ? '/api/hotel/items/import' : '/api/hotel/import', { kind: o.kind, rows: table.rows, mapping, dryRun });
    if (!r.ok) { say(r.data.error || 'Import impossible.', 'err'); return; }
    say('');
    result.textContent = '';
    const d = r.data as { valid?: number; created?: number; updated?: number; skipped?: number; typesCreated?: number; errors?: (string | { line: number; message: string })[] };
    const errs = (d.errors ?? []).map((e) => (typeof e === 'string' ? e : `Ligne ${e.line} : ${e.message}`));
    const summary = dryRun
      ? `${d.valid ?? 0} ligne(s) prêtes à importer, ${errs.length} à corriger.`
      : `Terminé : ${d.created ?? 0} créée(s), ${d.updated ?? 0} mise(s) à jour${d.skipped ? `, ${d.skipped} déjà présente(s)` : ''}${d.typesCreated ? `, ${d.typesCreated} type(s) de chambre ajouté(s)` : ''}.`;
    result.append(h('p', { class: errs.length ? 'err' : 'ok' }, summary));
    if (errs.length) result.appendChild(h('ul', {}, errs.slice(0, 30).map((e) => h('li', {}, e)), errs.length > 30 ? h('li', {}, `… et ${errs.length - 30} autre(s).`) : null));
    if (!dryRun) o.onDone();
  }

  paste.addEventListener('input', () => { if (paste.value.trim()) load(paste.value); });
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    if (f.size > 2_000_000) { say('Fichier trop gros (2 Mo maximum).', 'err'); return; }
    const text = await readText(f);
    paste.value = '';
    load(text);
  });

  const download = h('button', {
    class: 'sm', type: 'button',
    onclick: () => {
      const url = URL.createObjectURL(new Blob(['﻿' + o.template], { type: 'text/csv;charset=utf-8' }));
      const a = h('a', { href: url, download: o.templateName });
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    },
  }, 'Télécharger un modèle');

  box.append(
    h('p', { class: 'hint' }, 'Un fichier CSV (export Excel : « Enregistrer sous » → CSV) ou un tableau copié-collé. Les titres des colonnes sont reconnus automatiquement, vous pouvez les corriger avant d’importer.'),
    download, paste, h('label', {}, 'Ou choisir un fichier', file), msg, mapBox, result,
  );
}
