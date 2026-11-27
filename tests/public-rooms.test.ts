import { describe, expect, it } from 'vitest';
import { cleanName, cleanView, pricesFor, summaryFor, type PublicType } from '../src/lib/public-rooms';

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
  const types = [t('std-ar', 'Chambre Standard côté route', 49000, true), t('bal-ar', 'Chambre côté route avec balcon', 49000), t('sjr-ap', 'Suite Junior avec terrasse', 78000)];
  it('répartit les types entre les pages suites, double et twin', () => {
    expect(pricesFor('suites', types)?.map((p) => p.fcfa)).toEqual([78000]);
    expect(pricesFor('twin', types)?.map((p) => p.fcfa)).toEqual([49000]);
    expect(pricesFor('double', types)?.map((p) => p.fcfa)).toEqual([49000, 49000]);
    expect(pricesFor('autre', types)).toBeNull();
  });
  it('déduit personnes et literie de la page depuis les types', () => {
    const sans = { ...t('std-b2', 'Chambre Standard sans lit supplémentaire', 57000, true), extraBed: null, beds: 'Double ou twin' };
    const avec = { ...t('std-b', 'Chambre Standard', 57000, true), beds: 'Double ou twin ou triple' };
    const suite = { ...t('ste-b', 'Suite', 89000), beds: 'Double' };
    expect(summaryFor('double', [sans, avec, suite])).toEqual({ guests: '2 personnes (+1 lit supplémentaire possible selon la chambre)', beds: 'Lit double ou twin selon la chambre' });
    expect(summaryFor('suites', [sans, avec, suite])).toEqual({ guests: '2 personnes (+1 lit supplémentaire)', beds: 'Lit double' });
    expect(summaryFor('autre', [sans])).toBeNull();
  });
});
