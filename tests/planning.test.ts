import { describe, expect, it } from 'vitest';
import { planDay, type PlanStay } from '../src/lib/hotel/planning';
import { cleanRoom, cleanRoomType, cleanStay } from '../src/lib/hotel/validate';

const stay = (o: Partial<PlanStay> & { roomId: number; arrival: string; departure: string }): PlanStay => ({
  id: 1, guests: 2, extraBed: false, babyCot: false, status: 'booked', ...o,
});

describe('planDay', () => {
  const D = '2026-11-20';
  it('crée une tâche départ, avec l’arrivée du jour (3 personnes + lit d’appoint) sur la même chambre', () => {
    const t = planDay(D, [
      stay({ id: 1, roomId: 5, arrival: '2026-11-18', departure: D }),
      stay({ id: 2, roomId: 5, arrival: D, departure: '2026-11-22', guests: 3, extraBed: true }),
    ]);
    expect(t).toEqual([{ roomId: 5, kind: 'depart', guests: 3, arrivalToday: true, extraBed: true, babyCot: false }]);
  });
  it('crée une recouche pour un séjour en cours, pas pour le jour d’arrivée', () => {
    const t = planDay(D, [
      stay({ id: 1, roomId: 1, arrival: '2026-11-19', departure: '2026-11-22', guests: 2 }),
      stay({ id: 2, roomId: 2, arrival: D, departure: '2026-11-21' }),
    ]);
    expect(t).toEqual([{ roomId: 1, kind: 'recouche', guests: 2, arrivalToday: false, extraBed: false, babyCot: false }]);
  });
  it('un départ sans arrivée ne porte pas de nombre de personnes', () => {
    const t = planDay(D, [stay({ roomId: 3, arrival: '2026-11-18', departure: D })]);
    expect(t).toEqual([{ roomId: 3, kind: 'depart', guests: null, arrivalToday: false, extraBed: false, babyCot: false }]);
  });
  it('ignore les séjours annulés et ceux qui ne touchent pas la date', () => {
    const t = planDay(D, [
      stay({ roomId: 1, arrival: '2026-11-19', departure: '2026-11-22', status: 'cancelled' }),
      stay({ roomId: 2, arrival: '2026-11-25', departure: '2026-11-26' }),
      stay({ roomId: 3, arrival: '2026-11-10', departure: '2026-11-19' }),
    ]);
    expect(t).toEqual([]);
  });
  it('trie par chambre', () => {
    const t = planDay(D, [
      stay({ roomId: 9, arrival: '2026-11-19', departure: '2026-11-22' }),
      stay({ roomId: 2, arrival: '2026-11-19', departure: '2026-11-22' }),
    ]);
    expect(t.map((x) => x.roomId)).toEqual([2, 9]);
  });
});

describe('validation', () => {
  it('cleanRoom nettoie et refuse un numéro vide', () => {
    expect(cleanRoom({ number: ' 101 ', building: 'A', floor: '1', minibar: true })).toMatchObject({ ok: true, value: { number: '101', building: 'A', floor: '1', minibar: true } });
    expect(cleanRoom({ number: ' ' })).toMatchObject({ ok: false });
    expect(cleanRoom({ number: 'x'.repeat(30) })).toMatchObject({ ok: false });
  });
  it('cleanRoomType exige un code, un libellé et des capacités cohérentes', () => {
    expect(cleanRoomType({ code: 'Double', label: 'Chambre double', baseCapacity: 2, maxCapacity: 3 })).toMatchObject({ ok: true, value: { code: 'double', maxCapacity: 3 } });
    expect(cleanRoomType({ code: 'x', label: 'X', baseCapacity: 3, maxCapacity: 2 })).toMatchObject({ ok: false });
    expect(cleanRoomType({ code: '', label: 'X' })).toMatchObject({ ok: false });
  });
  it('cleanStay contrôle dates, personnes et heure', () => {
    const ok = cleanStay({ roomId: 3, guestName: 'Diop', guests: 2, arrival: '2026-11-20', departure: '2026-11-22', arrivalTime: '14:00' });
    expect(ok).toMatchObject({ ok: true, value: { roomId: 3, guests: 2, arrivalTime: '14:00' } });
    expect(cleanStay({ roomId: 3, guestName: 'D', guests: 2, arrival: '2026-11-22', departure: '2026-11-22' })).toMatchObject({ ok: false });
    expect(cleanStay({ roomId: 3, guestName: 'D', guests: 0, arrival: '2026-11-20', departure: '2026-11-22' })).toMatchObject({ ok: false });
    expect(cleanStay({ roomId: 3, guestName: '', guests: 1, arrival: '2026-11-20', departure: '2026-11-22' })).toMatchObject({ ok: false });
    expect(cleanStay({ roomId: 3, guestName: 'D', guests: 1, arrival: '2026-11-20', departure: '2026-11-22', arrivalTime: '99:99' })).toMatchObject({ ok: false });
  });
});
