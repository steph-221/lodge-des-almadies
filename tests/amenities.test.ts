import { describe, expect, it } from 'vitest';
import { amenityCsv, commonEquipment, groupForGuest, isAmenityValue, type AmenityValue } from '../src/lib/hotel/amenities-core';
import { equipmentFor, type PublicType } from '../src/lib/public-rooms';
import { readFileSync } from 'node:fs';

const item = (key: string, value: AmenityValue | null) => ({ key, labelFr: key.toUpperCase(), labelEn: '', value });

describe('équipements : ce que voit le client', () => {
  it('range inclus, sur demande et en supplément, et cache « non » et « à vérifier »', () => {
    const g = groupForGuest([item('a', 'oui'), item('b', 'sur_demande'), item('c', 'supplement'), item('d', 'non'), item('e', 'a_verifier'), item('f', null)]);
    expect(g.included.map((i) => i.key)).toEqual(['a']);
    expect(g.onRequest.map((i) => i.key)).toEqual(['b']);
    expect(g.extra.map((i) => i.key)).toEqual(['c']);
  });
  it('ne reconnaît que les valeurs prévues', () => {
    expect(isAmenityValue('oui')).toBe(true);
    expect(isAmenityValue('peut-etre')).toBe(false);
    expect(isAmenityValue(undefined)).toBe(false);
  });
});

describe('équipements d’une page qui regroupe plusieurs types', () => {
  const t = (vals: Record<string, AmenityValue>) => ({ amenities: Object.entries(vals).map(([key, value]) => ({ key, label: key, value })) });
  it('sépare ce qui est inclus partout de ce qui varie', () => {
    const r = commonEquipment([t({ clim: 'oui', minibar: 'supplement', balcon: 'oui' }), t({ clim: 'oui', minibar: 'oui', balcon: 'non' })]);
    expect(r.all).toEqual(['clim']);
    expect(r.some).toContain('minibar (en supplément ou inclus selon la chambre)');
    expect(r.some).toContain('balcon (dans certaines chambres)');
  });
  it('retire les numéros de chambre des libellés et dit « sur demande » quand c’est partout pareil', () => {
    const r = commonEquipment([t({ communicantes: 'oui', seche: 'sur_demande' }), t({ communicantes: 'non', seche: 'sur_demande' })]);
    expect(r.some).toEqual(['communicantes (dans certaines chambres)', 'seche (sur demande)']);
    const n = commonEquipment([{ amenities: [{ key: 'c', label: 'Chambres communicantes (201 et 203)', value: 'non' }, { key: 'd', label: 'Produits d’accueil (savon, gel)', value: 'oui' }] }]);
    expect(n.all).toEqual(['Produits d’accueil (savon, gel)']);
  });
  it('n’affiche pas un équipement à vérifier, ni un équipement absent partout', () => {
    const r = commonEquipment([t({ a: 'a_verifier', b: 'non' }), t({ a: 'oui', b: 'non' })]);
    expect(r.all).toEqual([]);
    expect(r.some).toEqual([]);
  });
  it('equipmentFor reprend le tri twin / double / suites', () => {
    const type = (code: string, twin: boolean, suite: boolean, value: AmenityValue): PublicType =>
      ({ code, name: code, building: 'A', view: '', fcfa: 1, extraBed: null, count: 1, twin, suite, amenities: [{ key: 'baignoire', label: 'Baignoire', value }] });
    const types = [type('t', true, false, 'non'), type('s', false, true, 'oui')];
    expect(equipmentFor('suites', types)?.all).toEqual(['Baignoire']);
    expect(equipmentFor('twin', types)?.all).toEqual([]);
    expect(equipmentFor('inconnu', types)).toBeNull();
  });
});

describe('listing CSV', () => {
  it('une ligne par chambre, accents et point-virgule pour Excel', () => {
    const csv = amenityCsv(
      [{ number: '203', building: 'A', typeLabel: 'Standard; côté route', values: { clim: 'oui', minibar: 'supplement', balcon: null } }],
      [{ key: 'clim', labelFr: 'Climatisation' }, { key: 'minibar', labelFr: 'Minibar' }, { key: 'balcon', labelFr: 'Balcon' }],
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.split('\r\n')[0]).toBe('﻿Chambre;Bâtiment;Type;Climatisation;Minibar;Balcon');
    expect(csv.split('\r\n')[1]).toBe('203;A;"Standard; côté route";Oui;En supplément;');
  });
});

describe('migration 0011', () => {
  const sql = readFileSync(new URL('../db/migrations/0011_equipements_chambres.sql', import.meta.url), 'utf8');
  it('répartit les 15 standards du bâtiment B : 13 sans lit supplémentaire, 2 avec (005 et 111)', () => {
    const moved = /where number in \(([^)]*)\)/.exec(sql)![1].match(/'(\d{3})'/g)!;
    expect(moved.length).toBe(13);
    expect(moved).not.toContain("'005'");
    expect(moved).not.toContain("'111'");
  });
  it('met le tarif des chambres 103 à 106 à 49 000 FCFA, seulement s\'il est encore à 63 000', () => {
    expect(sql).toContain("update room_types set price_fcfa = 49000 where lower(code) = 'bal-ar' and price_fcfa = 63000");
  });
  it('répartit les types sans lit supplémentaire : 205 et 207, 202 204 et 208', () => {
    expect(sql).toContain("number in ('205', '207')");
    expect(sql).toContain("number in ('202', '204', '208')");
  });
  it('ne garde plus « minibar » dans la nouvelle description de la suite', () => {
    const updated = /update room_types set description_fr = 'Notre plus grand[^;]*;/.exec(sql)![0].split('where')[0];
    expect(updated).not.toMatch(/minibar/i);
  });
});
