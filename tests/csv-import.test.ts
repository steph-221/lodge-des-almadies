import { describe, expect, it } from 'vitest';
import { parseTable } from '../src/lib/hotel/csv';
import { guessMapping, mapRooms, mapStays, parseBool, parseDate, parseTime, ROOM_FIELDS, STAY_FIELDS } from '../src/lib/hotel/import';

describe('parseTable', () => {
  it('détecte le point-virgule (export Excel français)', () => {
    const t = parseTable('Numéro;Bâtiment\n101;A\n102;B\n');
    expect(t.delimiter).toBe(';');
    expect(t.headers).toEqual(['Numéro', 'Bâtiment']);
    expect(t.rows).toEqual([['101', 'A'], ['102', 'B']]);
  });
  it('détecte la tabulation (copier-coller depuis Excel) et ignore le BOM et les lignes vides', () => {
    const t = parseTable('﻿Nom\tPers\r\nDiop\t2\r\n\r\n');
    expect(t.delimiter).toBe('\t');
    expect(t.headers).toEqual(['Nom', 'Pers']);
    expect(t.rows).toEqual([['Diop', '2']]);
  });
  it('gère les guillemets, séparateurs et sauts de ligne dans un champ', () => {
    const t = parseTable('a,b\n"x, y","l1\nl2"\n"dit ""oui""",z');
    expect(t.rows).toEqual([['x, y', 'l1\nl2'], ['dit "oui"', 'z']]);
  });
  it('renvoie un tableau vide pour un texte vide', () => {
    expect(parseTable('  \n ').rows).toEqual([]);
  });
});

describe('parseDate', () => {
  it('accepte ISO et formats français', () => {
    expect(parseDate('2026-11-20')).toBe('2026-11-20');
    expect(parseDate('20/11/2026')).toBe('2026-11-20');
    expect(parseDate('5-1-2027')).toBe('2027-01-05');
    expect(parseDate('20.11.26')).toBe('2026-11-20');
    expect(parseDate(' 20/11/2026 14:30 ')).toBe('2026-11-20');
  });
  it('refuse les dates impossibles ou illisibles', () => {
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseDate('abc')).toBeNull();
    expect(parseDate('')).toBeNull();
    expect(parseDate('2026-13-01')).toBeNull();
  });
});

describe('parseBool et parseTime', () => {
  it('lit oui/non', () => {
    for (const v of ['oui', 'Oui', 'x', '1', 'yes', 'true', 'O']) expect(parseBool(v)).toBe(true);
    for (const v of ['non', '', '0', 'no', 'false', undefined]) expect(parseBool(v)).toBe(false);
  });
  it('normalise les heures', () => {
    expect(parseTime('14h30')).toBe('14:30');
    expect(parseTime('9:05')).toBe('09:05');
    expect(parseTime('14:30:00')).toBe('14:30');
    expect(parseTime('25:00')).toBeNull();
    expect(parseTime('')).toBeNull();
  });
});

describe('guessMapping', () => {
  it('reconnaît les en-têtes courants, accents et casse ignorés', () => {
    const m = guessMapping(['Chambre', 'Nom du client', 'Nb pers.', 'Arrivée', 'Départ', 'Réf'], STAY_FIELDS);
    expect(m.room).toBe(0);
    expect(m.guest).toBe(1);
    expect(m.guests).toBe(2);
    expect(m.arrival).toBe(3);
    expect(m.departure).toBe(4);
    expect(m.external_id).toBe(5);
  });
  it('laisse -1 quand une colonne est absente et n’utilise pas une colonne deux fois', () => {
    const m = guessMapping(['Numéro', 'Étage'], ROOM_FIELDS);
    expect(m.number).toBe(0);
    expect(m.floor).toBe(1);
    expect(m.building).toBe(-1);
  });
});

describe('mapRooms', () => {
  const map = { number: 0, building: 1, floor: 2, type: 3, minibar: 4, notes: -1 };
  it('transforme les lignes et signale les erreurs ligne par ligne', () => {
    const r = mapRooms(
      [['101', 'A', '1', 'Double', 'oui'], ['', 'A', '1', 'Double', 'non'], ['101', 'B', '2', 'Twin', 'non'], ['102', '', '', '', '']],
      map,
    );
    expect(r.rows.map((x) => x.number)).toEqual(['101', '102']);
    expect(r.rows[0]).toMatchObject({ building: 'A', floor: '1', type: 'Double', minibar: true });
    expect(r.errors).toEqual([
      { line: 3, message: 'Numéro de chambre manquant.' },
      { line: 4, message: 'Chambre 101 en double dans le fichier.' },
    ]);
  });
});

describe('mapStays', () => {
  const map = { room: 0, guest: 1, guests: 2, arrival: 3, departure: 4, time: -1, extra_bed: -1, baby_cot: -1, notes: -1, external_id: -1 };
  it('valide dates, personnes et ordre des dates', () => {
    const r = mapStays(
      [
        ['101', 'Diop', '2', '20/11/2026', '23/11/2026'],
        ['102', 'Sow', '', '20/11/2026', '20/11/2026'],
        ['103', 'Ba', '9', '20/11/2026', '21/11/2026'],
        ['104', '', '1', '20/11/2026', '21/11/2026'],
        ['105', 'Fall', '1', 'x', '21/11/2026'],
      ],
      map,
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ room: '101', guest: 'Diop', guests: 2, arrival: '2026-11-20', departure: '2026-11-23' });
    expect(r.errors.map((e) => e.line)).toEqual([3, 4, 5, 6]);
    expect(r.errors[0].message).toMatch(/départ/i);
    expect(r.errors[1].message).toMatch(/personnes/i);
  });
  it('met 1 personne par défaut quand la colonne est vide', () => {
    const r = mapStays([['101', 'Diop', '', '2026-11-20', '2026-11-21']], map);
    expect(r.rows[0].guests).toBe(1);
  });
});
