import { describe, expect, it } from 'vitest';
import { canFixDefect, cleanInspection, cleanPoint, inspectionQueue, MAX_PHOTOS, type QueueRoom } from '../src/lib/hotel/inspections';

const room = (roomId: number, number: string, lastVisit: string | null): QueueRoom => ({ roomId, number, lastVisit });

describe('inspectionQueue', () => {
  it('met d’abord les chambres jamais visitées, puis de la visite la plus ancienne à la plus récente', () => {
    const rooms = [room(1, '101', '2026-11-10'), room(2, '102', null), room(3, '103', '2026-10-01'), room(4, '104', '2026-11-15'), room(5, '105', null)];
    expect(inspectionQueue(rooms, new Set(), 10).map((r) => r.number)).toEqual(['102', '105', '103', '101', '104']);
  });
  it('écarte les chambres occupées ce jour-là', () => {
    const rooms = [room(1, '101', null), room(2, '102', null), room(3, '103', '2026-01-01')];
    expect(inspectionQueue(rooms, new Set([1, 3]), 10).map((r) => r.number)).toEqual(['102']);
  });
  it('limite au nombre de visites par matin', () => {
    const rooms = [room(1, '101', null), room(2, '102', null), room(3, '103', null)];
    expect(inspectionQueue(rooms, new Set(), 2)).toHaveLength(2);
    expect(inspectionQueue(rooms, new Set(), 0)).toHaveLength(0);
  });
  it('classe les numéros dans l’ordre naturel (9 avant 10)', () => {
    const rooms = [room(1, '10', null), room(2, '9', null), room(3, '2', null)];
    expect(inspectionQueue(rooms, new Set(), 10).map((r) => r.number)).toEqual(['2', '9', '10']);
  });
  it('ne modifie pas la liste reçue', () => {
    const rooms = [room(1, '102', null), room(2, '101', null)];
    inspectionQueue(rooms, new Set(), 10);
    expect(rooms.map((r) => r.number)).toEqual(['102', '101']);
  });
});

describe('cleanInspection', () => {
  const ok = { roomId: 3, overall: 4, comment: ' RAS ', items: [{ pointId: 1, result: 'ok' }, { pointId: 2, result: 'fix', comment: 'Tache sur le mur', service: 'maintenance' }, { pointId: 3, result: 'na' }] };
  it('accepte une visite valide', () => {
    const r = cleanInspection(ok);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.comment).toBe('RAS');
      expect(r.value.items[1]).toMatchObject({ pointId: 2, result: 'fix', service: 'maintenance', comment: 'Tache sur le mur' });
      expect(r.value.items[0].service).toBeNull();
    }
  });
  it('exige un commentaire pour chaque point à corriger', () => {
    const r = cleanInspection({ ...ok, items: [{ pointId: 2, result: 'fix', comment: '  ' }] });
    expect(r.ok).toBe(false);
  });
  it('affecte le service par défaut (ménage) à un défaut sans service précisé', () => {
    const r = cleanInspection({ roomId: 1, items: [{ pointId: 2, result: 'fix', comment: 'x' }] });
    expect(r.ok && r.value.items[0].service).toBe('housekeeping');
  });
  it('refuse une note hors 1 à 5, un résultat inconnu, un point en double ou une chambre inconnue', () => {
    expect(cleanInspection({ ...ok, overall: 6 }).ok).toBe(false);
    expect(cleanInspection({ ...ok, items: [{ pointId: 1, result: 'bof' }] }).ok).toBe(false);
    expect(cleanInspection({ ...ok, items: [{ pointId: 1, result: 'ok' }, { pointId: 1, result: 'ok' }] }).ok).toBe(false);
    expect(cleanInspection({ ...ok, roomId: 0 }).ok).toBe(false);
  });
  it('accepte une visite sans note ni point', () => {
    expect(cleanInspection({ roomId: 1 }).ok).toBe(true);
  });
});

describe('cleanPoint', () => {
  it('accepte un point de grille', () => {
    expect(cleanPoint({ label: ' Literie ', zone: 'Chambre', service: 'housekeeping' })).toEqual({ ok: true, value: { label: 'Literie', zone: 'Chambre', service: 'housekeeping' } });
  });
  it('refuse un libellé vide ou un service inconnu', () => {
    expect(cleanPoint({ label: '', zone: 'x', service: 'housekeeping' }).ok).toBe(false);
    expect(cleanPoint({ label: 'x', zone: 'x', service: 'autre' }).ok).toBe(false);
  });
});

describe('canFixDefect', () => {
  it('chacun corrige les défauts de son service ; la direction tous', () => {
    expect(canFixDefect('direction', 'housekeeping')).toBe(true);
    expect(canFixDefect('direction', 'maintenance')).toBe(true);
    expect(canFixDefect('gouvernante', 'housekeeping')).toBe(true);
    expect(canFixDefect('gouvernante', 'maintenance')).toBe(false);
    expect(canFixDefect('technique', 'maintenance')).toBe(true);
    expect(canFixDefect('technique', 'housekeeping')).toBe(false);
    expect(canFixDefect('reception', 'housekeeping')).toBe(false);
  });
});

it('limite les photos à quatre par visite', () => { expect(MAX_PHOTOS).toBe(4); });
