import { describe, expect, it } from 'vitest';
import { cleanPeriod, delayStats, fmtMinutes, occupancy, topUse } from '../src/lib/hotel/reports-core';
import { levelFor, routePolicy } from '../src/lib/hotel/permissions';

describe('Période', () => {
  it('prend les 30 derniers jours par défaut', () => {
    expect(cleanPeriod(undefined, undefined, '2026-11-30')).toEqual({ ok: true, value: { from: '2026-11-01', to: '2026-11-30' } });
  });
  it('refuse une date impossible, un ordre inversé et une période trop longue', () => {
    expect(cleanPeriod('2026-02-30', '2026-03-10', '2026-03-10').ok).toBe(false);
    expect(cleanPeriod('2026-03-10', '2026-03-01', '2026-03-10').ok).toBe(false);
    expect(cleanPeriod('2025-01-01', '2026-12-31', '2026-12-31').ok).toBe(false);
    expect(cleanPeriod('2026-01-01', '2026-12-31', '2026-12-31').ok).toBe(true); // 365 jours
  });
});

describe('Occupation', () => {
  const stays = [
    { guests: 2, arrival: '2026-11-01', departure: '2026-11-04' }, // nuits 1, 2, 3
    { guests: 1, arrival: '2026-11-03', departure: '2026-11-05' }, // nuits 3, 4
    { guests: 3, arrival: '2026-10-30', departure: '2026-11-02' }, // nuit 1 dans la période
  ];
  const o = occupancy(stays, 10, '2026-11-01', '2026-11-05');
  it('compte les nuits, pas le jour du départ', () => {
    expect(o.nights.map((n) => n.rooms)).toEqual([2, 1, 2, 1, 0]);
    expect(o.roomNights).toBe(6);
    expect(o.guestNights).toBe(5 + 2 + 3 + 1);
  });
  it('calcule le taux sur les chambres disponibles', () => {
    expect(o.availableRoomNights).toBe(50);
    expect(o.rate).toBe(12);
  });
  it('durée moyenne et nuit la plus chargée', () => {
    expect(o.stays).toBe(3);
    expect(o.avgStay).toBe(2.7); // (3 + 2 + 3) / 3
    expect(o.peak?.date).toBe('2026-11-01');
  });
  it('ne divise pas par zéro sans chambre', () => {
    expect(occupancy([], 0, '2026-11-01', '2026-11-02').rate).toBe(0);
  });
});

describe('Délais', () => {
  const s = delayStats([
    { key: 'technique', status: 'done', startMin: 10, doneMin: 30 },
    { key: 'technique', status: 'done', startMin: 20, doneMin: 90 },
    { key: 'technique', status: 'done', startMin: 5, doneMin: 60 },
    { key: 'technique', status: 'new', startMin: null, doneMin: null },
    { key: 'technique', status: 'cancelled', startMin: null, doneMin: null },
    { key: 'reception', status: 'done', startMin: -5, doneMin: 15 },
  ]);
  it('moyenne, médiane et décompte par catégorie', () => {
    const t = s.find((x) => x.key === 'technique')!;
    expect(t).toMatchObject({ total: 5, done: 3, open: 1, cancelled: 1, avgStartMin: 12, avgDoneMin: 60, medianDoneMin: 60 });
  });
  it('écarte un délai négatif', () => {
    expect(s.find((x) => x.key === 'reception')!.avgStartMin).toBeNull();
  });
  it('affiche les durées', () => {
    expect(fmtMinutes(null)).toBe('—');
    expect(fmtMinutes(12)).toBe('12 min');
    expect(fmtMinutes(95)).toBe('1 h 35');
    expect(fmtMinutes(120)).toBe('2 h');
    expect(fmtMinutes(60 * 72)).toBe('3 j');
  });
});

describe('Consommation', () => {
  it('trie du plus consommé au moins consommé et retire les lignes vides', () => {
    const r = topUse([
      { itemId: 1, name: 'Eau', kind: 'minibar', unit: 'pièce', used: 5, lost: 0 },
      { itemId: 2, name: 'Drap', kind: 'linen', unit: 'pièce', used: 40, lost: 2 },
      { itemId: 3, name: 'Savon', kind: 'supply', unit: 'pièce', used: 0, lost: 0 },
    ]);
    expect(r.map((x) => x.name)).toEqual(['Drap', 'Eau']);
  });
});

describe('Accès', () => {
  it('direction en lecture/écriture, réception et gouvernante en lecture, les autres sans accès', () => {
    expect(levelFor('direction', 'reports')).toBe('E');
    expect(levelFor('reception', 'reports')).toBe('L');
    expect(levelFor('gouvernante', 'reports')).toBe('L');
    expect(levelFor('technique', 'reports')).toBeNull();
    expect(routePolicy('/admin/hotel/rapports/', 'GET', 'reception')).toBe('allow');
    expect(routePolicy('/api/hotel/reports', 'GET', 'reception')).toBe('allow');
    expect(routePolicy('/api/hotel/reports', 'GET', 'femme_chambre')).toBe('deny');
    expect(routePolicy('/admin/hotel/rapports/', 'GET', 'restaurant')).toBe('deny');
  });
});
