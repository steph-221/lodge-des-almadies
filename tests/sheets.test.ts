import { describe, expect, it } from 'vitest';
import {
  appendNote, buildSheetRows, cleanValidation, parseRead, rowNeedsReview, shouldMarkDone, sheetCode, type SheetRow,
} from '../src/lib/hotel/sheets-core';
import { describeSheet } from '../src/lib/hotel/vision';
import { levelFor, routePolicy } from '../src/lib/hotel/permissions';

const rows: SheetRow[] = buildSheetRows(
  [
    { id: 12, roomId: 2, roomNumber: '102', kind: 'recouche', guests: 2 },
    { id: 11, roomId: 1, roomNumber: '101', kind: 'depart', guests: null },
    { id: 20, roomId: 3, roomNumber: '10', kind: 'depart', guests: 1 },
  ],
  [{ roomId: 1, lines: [{ itemId: 7, itemName: 'Eau 50 cl', dotation: 2 }, { itemId: 8, itemName: 'Soda', dotation: 2 }] }],
);

const good = {
  code: 'FM-00042',
  rows: [
    { room: '10', done: 'checked', minibar: [], note: '', note_sure: true },
    { room: '101', done: 'checked', minibar: [{ item: 'Eau 50 cl', count: 1, sure: true }, { item: 'Soda', count: null, sure: true }], note: 'Ampoule grillée', note_sure: true },
    { room: '102', done: 'empty', minibar: [], note: '', note_sure: true },
  ],
};

describe('Fiche imprimée', () => {
  it('trie les chambres par numéro et reprend la dotation du minibar', () => {
    expect(rows.map((r) => r.roomNumber)).toEqual(['10', '101', '102']);
    expect(rows[1].minibar.map((m) => m.name)).toEqual(['Eau 50 cl', 'Soda']);
    expect(rows[0].minibar).toEqual([]);
  });
  it('numérote les fiches', () => {
    expect(sheetCode(42)).toBe('FM-00042');
  });
  it('décrit à la lecture les chambres et articles imprimés, sans nom de client', () => {
    const p = describeSheet(rows, 'FM-00042');
    expect(p).toContain('Chambre 101 — minibar : Eau 50 cl, Soda');
    expect(p).toContain('FM-00042');
  });
});

describe('Lecture du modèle', () => {
  it('rapproche une lecture nette sans rien signaler', () => {
    const r = parseRead(good, rows, 'FM-00042');
    expect(r.codeMatches).toBe(true);
    expect(r.rows.every((x) => !rowNeedsReview(x))).toBe(true);
    const r101 = r.rows.find((x) => x.roomNumber === '101')!;
    expect(r101.done).toBe(true);
    expect(r101.minibar).toEqual([
      { itemId: 7, name: 'Eau 50 cl', count: 1, sure: true },
      { itemId: 8, name: 'Soda', count: null, sure: true },
    ]);
    expect(r.rows.find((x) => x.roomNumber === '102')!.done).toBe(false);
  });
  it('signale une case illisible plutôt que de la deviner', () => {
    const raw = { ...good, rows: good.rows.map((x) => (x.room === '102' ? { ...x, done: 'unclear' } : x)) };
    const r = parseRead(raw, rows, 'FM-00042');
    const x = r.rows.find((y) => y.roomNumber === '102')!;
    expect(x.done).toBeNull();
    expect(rowNeedsReview(x)).toBe(true);
  });
  it('signale un chiffre incertain, une quantité hors dotation et une valeur absurde', () => {
    const mk = (count: unknown, sure: boolean) => ({
      ...good, rows: good.rows.map((x) => (x.room === '101' ? { ...x, minibar: [{ item: 'Eau 50 cl', count, sure }, { item: 'Soda', count: 1, sure: true }] } : x)),
    });
    const flagsOf = (raw: unknown) => parseRead(raw, rows, 'FM-00042').rows.find((x) => x.roomNumber === '101')!;
    expect(rowNeedsReview(flagsOf(mk(1, false)))).toBe(true);
    expect(rowNeedsReview(flagsOf(mk(5, true)))).toBe(true); // dotation 2
    expect(flagsOf(mk(5, true)).minibar[0].sure).toBe(false);
    const absurd = flagsOf(mk(-3, true));
    expect(absurd.minibar[0].count).toBeNull();
    expect(rowNeedsReview(absurd)).toBe(true);
    expect(rowNeedsReview(flagsOf(mk(2, true)))).toBe(false);
  });
  it('signale une ligne manquante, une ligne en double et ignore une chambre inconnue', () => {
    const missing = parseRead({ ...good, rows: good.rows.filter((x) => x.room !== '101') }, rows, 'FM-00042');
    expect(missing.rows.find((x) => x.roomNumber === '101')!.flags).toContain('ligne non lue');
    const dup = parseRead({ ...good, rows: [...good.rows, good.rows[2]] }, rows, 'FM-00042');
    expect(dup.rows.find((x) => x.roomNumber === '102')!.flags).toContain('ligne lue plusieurs fois');
    const extra = parseRead({ ...good, rows: [...good.rows, { room: '999', done: 'checked', minibar: [], note: '', note_sure: true }] }, rows, 'FM-00042');
    expect(extra.problems.some((p) => p.includes('999'))).toBe(true);
    expect(extra.rows).toHaveLength(3);
  });
  it('reconnaît le bon code malgré la casse et les espaces, refuse un autre code', () => {
    expect(parseRead({ ...good, code: 'fm 00042' }, rows, 'FM-00042').codeMatches).toBe(true);
    const other = parseRead({ ...good, code: 'FM-00043' }, rows, 'FM-00042');
    expect(other.codeMatches).toBe(false);
    expect(other.problems.length).toBeGreaterThan(0);
  });
  it('ne plante pas sur une réponse absurde', () => {
    expect(parseRead(null, rows, 'FM-00042').rows.every((x) => rowNeedsReview(x))).toBe(true);
    expect(parseRead({ rows: 'oups' }, rows, 'FM-00042').problems.length).toBeGreaterThan(0);
  });
  it('une remarque incertaine est à confirmer', () => {
    const raw = { ...good, rows: good.rows.map((x) => (x.room === '101' ? { ...x, note: 'Amp... gri...', note_sure: false } : x)) };
    expect(parseRead(raw, rows, 'FM-00042').rows.find((x) => x.roomNumber === '101')!.flags).toContain('remarque incertaine');
  });
});

describe('Validation', () => {
  const read = parseRead({ ...good, rows: good.rows.map((x) => (x.room === '102' ? { ...x, done: 'unclear' } : x)) }, rows, 'FM-00042');
  const final = (over: Record<string, unknown> = {}) => ({
    rows: [
      { taskId: 20, done: true, minibar: [], note: '' },
      { taskId: 11, done: true, minibar: [{ itemId: 7, counted: 1 }], note: 'Ampoule grillée' },
      { taskId: 12, done: false, minibar: [], note: '' },
    ],
    reviewed: [] as number[],
    ...over,
  });
  it('exige la confirmation des lignes douteuses d’une lecture', () => {
    const r = cleanValidation(final(), rows, read);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain('102');
    expect(cleanValidation(final({ reviewed: [12] }), rows, read).ok).toBe(true);
  });
  it('sans photo, la saisie de la gouvernante suffit', () => {
    expect(cleanValidation(final(), rows, null).ok).toBe(true);
  });
  it('refuse une photo d’une autre fiche', () => {
    const bad = parseRead({ ...good, code: 'FM-00001' }, rows, 'FM-00042');
    expect(cleanValidation(final({ reviewed: [11, 12, 20] }), rows, bad).ok).toBe(false);
  });
  it('refuse chambre inconnue, doublon, ligne manquante, quantité invalide, article hors fiche', () => {
    const base = final().rows;
    expect(cleanValidation({ rows: [...base.slice(0, 2), { taskId: 99, done: true, minibar: [], note: '' }], reviewed: [] }, rows, null).ok).toBe(false);
    expect(cleanValidation({ rows: [...base, base[0]], reviewed: [] }, rows, null).ok).toBe(false);
    expect(cleanValidation({ rows: base.slice(0, 2), reviewed: [] }, rows, null).ok).toBe(false);
    expect(cleanValidation({ rows: base.map((x) => (x.taskId === 11 ? { ...x, minibar: [{ itemId: 7, counted: 100 }] } : x)), reviewed: [] }, rows, null).ok).toBe(false);
    expect(cleanValidation({ rows: base.map((x) => (x.taskId === 11 ? { ...x, minibar: [{ itemId: 55, counted: 1 }] } : x)), reviewed: [] }, rows, null).ok).toBe(false);
    expect(cleanValidation({ rows: base.map((x) => (x.taskId === 11 ? { ...x, done: 'oui' } : x)), reviewed: [] }, rows, null).ok).toBe(false);
  });
});

describe('Application', () => {
  it('la fiche fait avancer une tâche, jamais reculer', () => {
    expect(shouldMarkDone('todo', true)).toBe(true);
    expect(shouldMarkDone('doing', true)).toBe(true);
    expect(shouldMarkDone('done', true)).toBe(false);
    expect(shouldMarkDone('checked', true)).toBe(false);
    expect(shouldMarkDone('todo', false)).toBe(false);
  });
  it('ajoute la remarque sans écraser la note ni la répéter', () => {
    expect(appendNote('', 'Ampoule')).toBe('Fiche : Ampoule');
    expect(appendNote('Lit bébé', 'Ampoule')).toBe('Lit bébé | Fiche : Ampoule');
    expect(appendNote('Fiche : Ampoule', 'Ampoule')).toBe('Fiche : Ampoule');
    expect(appendNote('x', '  ')).toBe('x');
  });
});

describe('Accès', () => {
  it('la direction et la gouvernante gèrent les fiches, la femme de chambre n’a qu’un périmètre', () => {
    expect(levelFor('direction', 'sheets')).toBe('E');
    expect(levelFor('gouvernante', 'sheets')).toBe('E');
    expect(levelFor('femme_chambre', 'sheets')).toBe('P');
    expect(routePolicy('/api/hotel/sheets', 'POST', 'gouvernante')).toBe('allow');
    expect(routePolicy('/api/hotel/sheets', 'POST', 'femme_chambre')).toBe('allow'); // périmètre contrôlé dans la route
    expect(routePolicy('/api/hotel/sheets', 'GET', 'reception')).toBe('deny');
    expect(routePolicy('/api/hotel/sheets', 'GET', 'restaurant')).toBe('deny');
    expect(routePolicy('/admin/hotel/fiches/', 'GET', 'gouvernante')).toBe('allow');
    expect(routePolicy('/admin/hotel/fiches/', 'GET', 'technique')).toBe('deny');
  });
});
