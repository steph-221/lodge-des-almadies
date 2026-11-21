import { describe, expect, it } from 'vitest';
import { linenNeeds, minibarConsumption, reconcileLaundry, type PrepLine, type NeedTask } from '../src/lib/hotel/linen';
import { ITEM_FIELDS, cleanItem, mapItems, parseItemKind } from '../src/lib/hotel/items';
import { guessMapping } from '../src/lib/hotel/import';

const DRAP = 1, SERV = 2, LIT = 3, SAVON = 4;
const line = (o: Partial<PrepLine> & { itemId: number; qty: number }): PrepLine => ({ roomTypeId: null, kind: 'depart', occupancy: null, cond: null, ...o });
const task = (o: Partial<NeedTask> = {}): NeedTask => ({ roomTypeId: 10, kind: 'depart', guests: 2, extraBed: false, babyCot: false, ...o });
const total = (r: { itemId: number; qty: number }[], id: number) => r.find((x) => x.itemId === id)?.qty ?? 0;

describe('linenNeeds', () => {
  it('somme les besoins de plusieurs chambres', () => {
    const lines = [line({ itemId: DRAP, qty: 2 }), line({ itemId: SERV, qty: 2 })];
    const r = linenNeeds([task(), task(), task()], lines);
    expect(total(r, DRAP)).toBe(6);
    expect(total(r, SERV)).toBe(6);
  });

  it('ne retient que la nature (départ ou recouche) de la tâche', () => {
    const lines = [line({ itemId: DRAP, qty: 2 }), line({ itemId: DRAP, qty: 0, kind: 'recouche' }), line({ itemId: SERV, qty: 1, kind: 'recouche' })];
    const r = linenNeeds([task({ kind: 'recouche' })], lines);
    expect(total(r, DRAP)).toBe(0);
    expect(total(r, SERV)).toBe(1);
  });

  it('la ligne la plus précise remplace la générale (type et occupation)', () => {
    const lines = [
      line({ itemId: SERV, qty: 2 }),
      line({ itemId: SERV, qty: 3, occupancy: 3 }),
      line({ itemId: SERV, qty: 4, roomTypeId: 10 }),
      line({ itemId: SERV, qty: 5, roomTypeId: 10, occupancy: 3 }),
    ];
    expect(total(linenNeeds([task({ roomTypeId: 99, guests: 1 })], lines), SERV)).toBe(2);
    expect(total(linenNeeds([task({ roomTypeId: 99, guests: 3 })], lines), SERV)).toBe(3);
    expect(total(linenNeeds([task({ roomTypeId: 10, guests: 1 })], lines), SERV)).toBe(4);
    expect(total(linenNeeds([task({ roomTypeId: 10, guests: 3 })], lines), SERV)).toBe(5);
  });

  it('avec un nombre de personnes inconnu, seules les lignes sans occupation servent', () => {
    const lines = [line({ itemId: SERV, qty: 2 }), line({ itemId: SERV, qty: 4, occupancy: 2 })];
    expect(total(linenNeeds([task({ guests: null })], lines), SERV)).toBe(2);
  });

  it('ajoute les lits d’appoint et lits bébé seulement si demandés', () => {
    const lines = [line({ itemId: LIT, qty: 1, cond: 'extra_bed' }), line({ itemId: LIT, qty: 1, cond: 'baby_cot' })];
    expect(linenNeeds([task()], lines)).toEqual([]);
    expect(total(linenNeeds([task({ extraBed: true })], lines), LIT)).toBe(1);
    expect(total(linenNeeds([task({ extraBed: true, babyCot: true })], lines), LIT)).toBe(2);
  });

  it('une quantité de 0 sur une ligne précise annule la ligne générale', () => {
    const lines = [line({ itemId: SAVON, qty: 2 }), line({ itemId: SAVON, qty: 0, kind: 'depart', roomTypeId: 10 })];
    expect(total(linenNeeds([task()], lines), SAVON)).toBe(0);
  });

  it('rend une liste triée et sans article à zéro', () => {
    const lines = [line({ itemId: 9, qty: 1 }), line({ itemId: 2, qty: 3 }), line({ itemId: 5, qty: 0 })];
    expect(linenNeeds([task()], lines)).toEqual([{ itemId: 2, qty: 3 }, { itemId: 9, qty: 1 }]);
  });
});

describe('reconcileLaundry', () => {
  it('calcule les manquants', () => {
    const r = reconcileLaundry([{ itemId: 1, sent: 50, received: 46, damaged: 2 }]);
    expect(r.ok).toBe(true);
    expect(r.lines[0].missing).toBe(2);
  });
  it('refuse plus de retours que d’envois', () => {
    const r = reconcileLaundry([{ itemId: 1, sent: 10, received: 9, damaged: 2 }]);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/dépasse/);
  });
  it('refuse les quantités négatives ou non entières', () => {
    expect(reconcileLaundry([{ itemId: 1, sent: 10, received: -1, damaged: 0 }]).ok).toBe(false);
    expect(reconcileLaundry([{ itemId: 1, sent: 10, received: 1.5, damaged: 0 }]).ok).toBe(false);
  });
});

describe('minibarConsumption', () => {
  it('consommation = dotation − comptage, jamais négative', () => {
    expect(minibarConsumption(4, 1)).toEqual({ consumed: 3, restock: 3 });
    expect(minibarConsumption(4, 4)).toEqual({ consumed: 0, restock: 0 });
    expect(minibarConsumption(4, 6)).toEqual({ consumed: 0, restock: 0 });
  });
});

describe('import du catalogue', () => {
  it('reconnaît les colonnes courantes', () => {
    const m = guessMapping(['Article', 'Catégorie', 'Unité', 'Seuil', 'Prix', 'Stock'], ITEM_FIELDS);
    expect(m.name).toBe(0);
    expect(m.kind).toBe(1);
    expect(m.unit).toBe(2);
    expect(m.min_stock).toBe(3);
    expect(m.price).toBe(4);
    expect(m.stock).toBe(5);
  });
  it('comprend les natures en français et en anglais', () => {
    expect(parseItemKind('Linge')).toBe('linen');
    expect(parseItemKind('consommable')).toBe('supply');
    expect(parseItemKind('Produit d’accueil')).toBe('supply');
    expect(parseItemKind('Minibar')).toBe('minibar');
    expect(parseItemKind('')).toBe('supply');
  });
  it('signale ligne par ligne les erreurs et les doublons', () => {
    const rows = [['Drap', 'linge', 'pièce', '20', '', '120'], ['', 'linge', '', '', '', ''], ['drap', 'linge', '', '', '', ''], ['Eau', 'minibar', 'bouteille', '', '500', '60'], ['Gel', 'consommable', '', 'x', '', '']];
    const m = mapItems(rows, { name: 0, kind: 1, unit: 2, min_stock: 3, price: 4, stock: 5 });
    expect(m.rows.map((r) => r.name)).toEqual(['Drap', 'Eau']);
    expect(m.rows[1]).toMatchObject({ kind: 'minibar', price: 500, stock: 60 });
    expect(m.errors.map((e) => e.line)).toEqual([3, 4, 6]);
  });
});

describe('cleanItem', () => {
  it('accepte un article valide', () => {
    const r = cleanItem({ name: ' Drap 2 places ', kind: 'linen', unit: 'pièce', minStock: '20', price: 0 });
    expect(r).toEqual({ ok: true, value: { name: 'Drap 2 places', kind: 'linen', unit: 'pièce', minStock: 20, price: 0 } });
  });
  it('refuse un nom vide, une nature inconnue ou un prix négatif', () => {
    expect(cleanItem({ name: '', kind: 'linen' }).ok).toBe(false);
    expect(cleanItem({ name: 'x', kind: 'autre' }).ok).toBe(false);
    expect(cleanItem({ name: 'x', kind: 'linen', price: -5 }).ok).toBe(false);
  });
});
