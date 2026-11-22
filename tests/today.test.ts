import { describe, expect, it } from 'vitest';
import { briefEmail, cleanLogEntry, parseRecipients, summarizeStays, type BriefData, type DayStay } from '../src/lib/hotel/today';

const stay = (o: Partial<DayStay> & { roomNumber: string; arrival: string; departure: string }): DayStay => ({ guestName: 'Client ' + o.roomNumber, guests: 2, ...o });
const D = '2026-11-20';

describe('summarizeStays', () => {
  const stays = [
    stay({ roomNumber: '101', arrival: '2026-11-18', departure: D, guests: 2 }),   // départ
    stay({ roomNumber: '102', arrival: D, departure: '2026-11-22', guests: 3 }),   // arrivée
    stay({ roomNumber: '103', arrival: '2026-11-19', departure: '2026-11-23', guests: 1 }), // recouche
    stay({ roomNumber: '9', arrival: '2026-11-19', departure: '2026-11-21', guests: 2 }),   // recouche
    stay({ roomNumber: '104', arrival: '2026-11-25', departure: '2026-11-26' }),   // hors période
  ];
  it('compte arrivées, départs et recouches', () => {
    const s = summarizeStays(D, stays);
    expect(s.arrivals.map((x) => x.roomNumber)).toEqual(['102']);
    expect(s.departures.map((x) => x.roomNumber)).toEqual(['101']);
    expect(s.stayovers.map((x) => x.roomNumber)).toEqual(['9', '103']);
  });
  it('compte les chambres occupées cette nuit et les personnes', () => {
    const s = summarizeStays(D, stays);
    expect(s.occupiedTonight).toBe(3);   // 102, 103, 9
    expect(s.guestsTonight).toBe(6);     // 3 + 1 + 2
  });
  it('prévoit les petits-déjeuners : clients qui ont dormi la nuit précédente', () => {
    expect(summarizeStays(D, stays).breakfasts).toBe(5); // 101 (2) + 103 (1) + 9 (2)
  });
  it('ignore ce qui ne touche pas le jour', () => {
    const s = summarizeStays(D, [stay({ roomNumber: '1', arrival: '2026-12-01', departure: '2026-12-03' })]);
    expect(s.arrivals).toHaveLength(0);
    expect(s.occupiedTonight).toBe(0);
  });
});

describe('parseRecipients', () => {
  it('accepte une liste séparée par virgules, points-virgules ou retours à la ligne', () => {
    expect(parseRecipients('a@x.com; b@y.org,\n c@z.sn')).toEqual({ ok: true, value: ['a@x.com', 'b@y.org', 'c@z.sn'] });
  });
  it('dédoublonne sans tenir compte de la casse', () => {
    expect(parseRecipients('A@x.com, a@x.com')).toEqual({ ok: true, value: ['a@x.com'] });
  });
  it('refuse une adresse invalide ou trop de destinataires', () => {
    expect(parseRecipients('pas-une-adresse').ok).toBe(false);
    expect(parseRecipients(Array.from({ length: 21 }, (_, i) => `u${i}@x.com`).join(',')).ok).toBe(false);
  });
  it('accepte une liste vide', () => {
    expect(parseRecipients('  ')).toEqual({ ok: true, value: [] });
  });
});

describe('cleanLogEntry', () => {
  it('nettoie un message', () => { expect(cleanLogEntry({ body: '  Panne de clim 204  ' })).toEqual({ ok: true, value: { body: 'Panne de clim 204' } }); });
  it('refuse un message vide ou trop long', () => {
    expect(cleanLogEntry({ body: ' ' }).ok).toBe(false);
    expect(cleanLogEntry({ body: 'x'.repeat(1001) }).ok).toBe(false);
    expect(cleanLogEntry({}).ok).toBe(false);
  });
});

describe('briefEmail', () => {
  const data: BriefData = {
    date: D, arrivals: 4, departures: 3, stayovers: 5, occupiedTonight: 9, guestsTonight: 17, breakfasts: 14,
    tasks: { todo: 6, doing: 1, done: 2, checked: 0 }, outOfService: ['204', '305'], linenShort: ['Drap : manque 4'], defects: { housekeeping: 2, maintenance: 1 }, openExtras: 12000,
  };
  it('ne contient aucun nom de client et reste lisible', () => {
    const m = briefEmail(data, 'https://example.org');
    expect(m.subject).toContain('20/11/2026');
    expect(m.text).toContain('Arrivées : 4');
    expect(m.text).toContain('Petits-déjeuners à prévoir : 14');
    expect(m.text).toContain('204, 305');
    expect(m.text).toContain('Drap : manque 4');
    expect(m.html).toContain('https://example.org/admin/hotel/');
  });
  it('échappe le HTML des données saisies', () => {
    const m = briefEmail({ ...data, outOfService: ['<b>x</b>'] }, '');
    expect(m.html).not.toContain('<b>x</b>');
    expect(m.html).toContain('&lt;b&gt;');
  });
});
