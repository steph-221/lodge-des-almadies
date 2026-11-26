import { describe, expect, it } from 'vitest';
import { cleanName, cleanView, pricesFor, type PublicType } from '../src/lib/public-rooms';

describe('tarifs publics depuis la base', () => {
  it('retire le bâtiment du libellé et de l’emplacement, et ce que le nom dit déjà', () => {
    expect(cleanName('Chambre Standard côté route (bâtiment A)')).toBe('Chambre Standard côté route');
    expect(cleanView('Bâtiment A, côté route, sans balcon', 'Chambre Standard côté route')).toBe('Sans balcon');
    expect(cleanView('Bâtiment A, côté route, avec balcon', 'Chambre côté route avec balcon')).toBe('');
    expect(cleanView('Bâtiment A, côté piscine, terrasse', 'Suite Junior avec terrasse')).toBe('Côté piscine');
    expect(cleanView('Bâtiment B')).toBe('');
  });
  const t = (code: string, name: string, fcfa: number, twin = false): PublicType =>
    ({ code, name, building: 'A', view: '', fcfa, extraBed: 10000, count: 1, twin, suite: /^suite/i.test(name), amenities: [] });
  const types = [t('std-ar', 'Chambre Standard côté route', 49000, true), t('bal-ar', 'Chambre côté route avec balcon', 63000), t('sjr-ap', 'Suite Junior avec terrasse', 78000)];
  it('répartit les types entre les pages suites, double et twin', () => {
    expect(pricesFor('suites', types)?.map((p) => p.fcfa)).toEqual([78000]);
    expect(pricesFor('twin', types)?.map((p) => p.fcfa)).toEqual([49000]);
    expect(pricesFor('double', types)?.map((p) => p.fcfa)).toEqual([49000, 63000]);
    expect(pricesFor('autre', types)).toBeNull();
  });
});
