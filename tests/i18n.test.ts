import { describe, expect, it } from 'vitest';
import en from '../src/i18n/en.json';
import defaults from '../src/data/content.default.json';
// @ts-ignore : script Node sans types, partagé avec « npm run i18n:missing »
import { codeKeys, contentKeys } from '../scripts/i18n-missing.mjs';
import { fmtEur, fmtFcfa } from '../src/lib/content';
import { fmtNumber, langOf, localePath, makeT, switchPath, translateTree } from '../src/lib/i18n';
import { commonEquipment } from '../src/lib/hotel/amenities-core';
import { equipmentFor, pricesFor, typeName, cleanNameEn, type PublicType } from '../src/lib/public-rooms';

const dict = en as Record<string, string>;
const t = makeT('en');

describe('chemins par langue', () => {
  it('détecte la langue depuis l’URL', () => {
    expect(langOf('/en/')).toBe('en');
    expect(langOf('/en')).toBe('en');
    expect(langOf('/en/tarifs/')).toBe('en');
    expect(langOf('/')).toBe('fr');
    expect(langOf('/engagement/')).toBe('fr');
  });
  it('préfixe les liens internes en anglais et laisse le reste', () => {
    expect(localePath('en', '/')).toBe('/en/');
    expect(localePath('en', '/tarifs/')).toBe('/en/tarifs/');
    expect(localePath('en', '/contact/?objet=seminaire')).toBe('/en/contact/?objet=seminaire');
    expect(localePath('en', '/en/hotel/')).toBe('/en/hotel/');
    expect(localePath('en', '/img/logo.png')).toBe('/img/logo.png');
    expect(localePath('en', 'https://exemple.com/')).toBe('https://exemple.com/');
    expect(localePath('fr', '/tarifs/')).toBe('/tarifs/');
  });
  it('trouve la page équivalente dans l’autre langue', () => {
    expect(switchPath('fr', '/')).toBe('/en/');
    expect(switchPath('fr', '/hotel/')).toBe('/en/hotel/');
    expect(switchPath('en', '/en/')).toBe('/');
    expect(switchPath('en', '/en/chambres/twin/')).toBe('/chambres/twin/');
  });
});

describe('traduction', () => {
  it('traduit par le texte français, avec variables', () => {
    expect(t('Réserver')).toBe('Book now');
    expect(t('{n} chambres', { n: 3 })).toBe('3 rooms');
    expect(makeT('fr')('Réserver')).toBe('Réserver');
  });
  it('affiche le français quand la phrase n’est pas traduite (texte modifié dans /admin)', () => {
    expect(t('Une phrase toute neuve saisie dans l’admin')).toBe('Une phrase toute neuve saisie dans l’admin');
    expect(t.has('Réserver')).toBe(true);
    expect(t.has('Une phrase toute neuve')).toBe(false);
  });
  it('traduit un arbre de contenu sans toucher aux prix, images ni numéros, et préfixe les liens', () => {
    const out = translateTree({ title: 'Suites', fcfa: 78000, img: 'suite-01', images: ['suite-01'], phone: '(+221) 33', href: '/hotel/', items: [{ label: 'Coffre-fort' }] }, t);
    expect(out).toEqual({ title: 'Suites', fcfa: 78000, img: 'suite-01', images: ['suite-01'], phone: '(+221) 33', href: '/en/hotel/', items: [{ label: 'In-room safe' }] });
  });
  it('formate les montants à l’anglaise sans changer le français', () => {
    expect(fmtFcfa(78000, 'en')).toBe('78,000 FCFA');
    expect(fmtEur(78000, 650, 'en')).toBe('≈ €120');
    expect(fmtNumber(49000, 'fr')).toBe('49 000');
    expect(fmtFcfa(49000)).toBe('49 000 FCFA');
    expect(fmtEur(49000, 650)).toBe('≈ 75 €');
  });
});

describe('dictionnaire anglais', () => {
  it('couvre tous les textes du code et du contenu par défaut', () => {
    const keys = new Set<string>([...codeKeys('src'), ...contentKeys(defaults)]);
    const missing = [...keys].filter((k) => !(k in dict));
    expect(missing, 'phrases à ajouter dans src/i18n/en.json (npm run i18n:missing)').toEqual([]);
  });
  it('garde les mêmes variables {x} que le français et ne contient aucune traduction vide', () => {
    for (const [fr, en] of Object.entries(dict)) {
      expect(en.trim(), fr).not.toBe('');
      expect([...en.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort(), fr).toEqual([...fr.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort());
    }
  });
  it('n’emploie pas de guillemet droit pour l’apostrophe dans les textes anglais (typographie du site)', () => {
    for (const [fr, en] of Object.entries(dict)) expect(en, fr).not.toMatch(/\w'\w/);
  });
});

describe('chambres en anglais (textes venus de la base)', () => {
  const am = (key: string, label: string, labelEn: string, value: any) => ({ key, label, labelEn, value });
  const type = (code: string, name: string, nameEn: string, fcfa: number, amenities: any[]): PublicType => ({ code, name, nameEn, building: 'A', view: 'Côté piscine', fcfa, extraBed: 10000, count: 1, twin: false, suite: /^suite/i.test(name), amenities });
  const a = type('std-ap', 'Chambre Standard côté piscine', 'Standard Room – Pool side', 53000, [am('wifi', 'Wi-Fi haut débit gratuit', 'Free high-speed Wi-Fi', 'oui'), am('minibar', 'Minibar', 'Minibar', 'supplement')]);
  const b = type('bal-ap', 'Chambre côté piscine avec balcon', 'Room with balcony – Pool side', 53000, [am('wifi', 'Wi-Fi haut débit gratuit', 'Free high-speed Wi-Fi', 'oui'), am('minibar', 'Minibar', 'Minibar', 'oui')]);
  it('retire le bâtiment du nom anglais', () => {
    expect(cleanNameEn('Standard Room – Street side (Building A)')).toBe('Standard Room – Street side');
    expect(cleanNameEn('')).toBe('');
  });
  it('utilise les libellés anglais des équipements et des variantes', () => {
    expect(commonEquipment([a, b], 'en')).toEqual({ all: ['Free high-speed Wi-Fi'], some: ['Minibar (extra charge or included, depending on the room)'] });
    expect(commonEquipment([a, b])).toEqual({ all: ['Wi-Fi haut débit gratuit'], some: ['Minibar (en supplément ou inclus selon la chambre)'] });
    expect(equipmentFor('double', [a, b], 'en')?.all).toEqual(['Free high-speed Wi-Fi']);
  });
  it('compose le libellé de tarif en anglais, et retombe sur le français sans nom anglais', () => {
    const tr = (s: string) => t(s);
    expect(pricesFor('double', [a], 'en', tr)?.[0].label).toBe('Standard Room – Pool side · Building A · Pool side');
    expect(pricesFor('double', [a])?.[0].label).toBe('Chambre Standard côté piscine · bâtiment A · Côté piscine');
    expect(typeName({ ...a, nameEn: undefined }, 'en')).toBe('Chambre Standard côté piscine');
  });
});
