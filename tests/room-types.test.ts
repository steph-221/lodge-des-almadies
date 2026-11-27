import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { cleanRoom, cleanRoomType } from '../src/lib/hotel/validate';
import content from '../src/data/content.default.json';

describe('cleanRoomType (descriptif)', () => {
  it('garde le descriptif et lit les montants saisis avec espaces', () => {
    const c = cleanRoomType({ code: 'STD-B', label: 'Chambre Standard', baseCapacity: 2, maxCapacity: 3, priceFcfa: '57 000', extraBedFcfa: 10000, areaM2: '18,5', building: 'B', descriptionFr: 'Climatisée' });
    expect(c.ok).toBe(true);
    if (c.ok) expect(c.value).toMatchObject({ code: 'std-b', priceFcfa: 57000, extraBedFcfa: 10000, areaM2: 18.5, building: 'B', descriptionFr: 'Climatisée', labelEn: '' });
  });
  it('accepte un tarif ou une superficie vides', () => {
    const c = cleanRoomType({ code: 'x', label: 'X', priceFcfa: '', areaM2: null });
    expect(c.ok && c.value.priceFcfa === null && c.value.areaM2 === null).toBe(true);
  });
  it('refuse un tarif négatif ou décimal, et une superficie hors bornes', () => {
    expect(cleanRoomType({ code: 'x', label: 'X', priceFcfa: -1 }).ok).toBe(false);
    expect(cleanRoomType({ code: 'x', label: 'X', priceFcfa: '49000.5' }).ok).toBe(false);
    expect(cleanRoomType({ code: 'x', label: 'X', areaM2: 2 }).ok).toBe(false);
  });
});

describe('descriptif des chambres', () => {
  const sql = readFileSync(new URL('../db/migrations/0010_descriptif_chambres.sql', import.meta.url), 'utf8');
  const rooms = [...sql.matchAll(/^ {2}\('(\d{3})', '([AB])', '(RDC|1|2)', '([a-z-]+)'/gm)];
  it('la migration crée 36 chambres uniques, 20 au bâtiment B et 16 au bâtiment A', () => {
    expect(rooms.length).toBe(36);
    expect(new Set(rooms.map((r) => r[1])).size).toBe(36);
    expect(rooms.filter((r) => r[2] === 'B').length).toBe(20);
  });
  it('le tableau des tarifs du site compte les mêmes 36 chambres', () => {
    expect(content.tarifs.rooms.reduce((n, r) => n + r.count, 0)).toBe(36);
  });
});

describe('cleanRoom (capacité propre à la chambre)', () => {
  it('vide = comme le type', () => {
    expect(cleanRoom({ number: '101', baseCapacity: '', maxCapacity: '' })).toMatchObject({ ok: true, value: { baseCapacity: null, maxCapacity: null } });
  });
  it('accepte 2/2, 2/3 et 3/3', () => {
    for (const [b, m] of [[2, 2], [2, 3], [3, 3]]) expect(cleanRoom({ number: '101', baseCapacity: b, maxCapacity: String(m) })).toMatchObject({ ok: true, value: { baseCapacity: b, maxCapacity: m } });
  });
  it('accepte seulement le maximum (le nombre de base reste celui du type)', () => {
    expect(cleanRoom({ number: '101', maxCapacity: 3 })).toMatchObject({ ok: true, value: { baseCapacity: null, maxCapacity: 3 } });
  });
  it('refuse un maximum sous le nombre de base, 0 et plus de 8', () => {
    expect(cleanRoom({ number: '101', baseCapacity: 3, maxCapacity: 2 })).toMatchObject({ ok: false });
    expect(cleanRoom({ number: '101', baseCapacity: 0 })).toMatchObject({ ok: false });
    expect(cleanRoom({ number: '101', maxCapacity: 9 })).toMatchObject({ ok: false });
  });
});
