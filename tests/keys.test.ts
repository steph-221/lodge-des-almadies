import { describe, expect, it } from 'vitest';
import { canChangeCard, canCloseItem, cleanCard, cleanCardStatus, cleanItem, cleanItemClose, lostCardNotice } from '../src/lib/hotel/keys-core';
import { levelFor, routePolicy } from '../src/lib/hotel/permissions';

describe('Cartes', () => {
  it('contrôle une carte', () => {
    expect(cleanCard({ code: 'A1:B2:C3', kind: 'client', roomId: '12' })).toEqual({ ok: true, value: { code: 'A1:B2:C3', kind: 'client', roomId: 12, holder: '', notes: '' } });
    expect(cleanCard({ code: '' }).ok).toBe(false);
    expect(cleanCard({ code: '<script>' }).ok).toBe(false);
    expect(cleanCard({ code: 'X1', kind: 'magique' }).ok).toBe(false);
    expect(cleanCard({ code: 'X1', roomId: -3 }).ok).toBe(false);
    expect(cleanCard({ code: 'P1', kind: 'personnel' }).ok).toBe(false);
    expect(cleanCard({ code: 'P1', kind: 'personnel', holder: 'Awa' }).ok).toBe(true);
  });
  it('une carte perdue ou retirée ne redevient jamais active', () => {
    expect(canChangeCard('active', 'lost')).toBe(true);
    expect(canChangeCard('active', 'retired')).toBe(true);
    expect(canChangeCard('lost', 'active')).toBe(false);
    expect(canChangeCard('retired', 'active')).toBe(false);
    expect(canChangeCard('lost', 'retired')).toBe(false);
    expect(canChangeCard('active', 'active')).toBe(false);
  });
  it('contrôle le changement d’état', () => {
    expect(cleanCardStatus({ status: 'lost', note: 'Perdue à la piscine' }).ok).toBe(true);
    expect(cleanCardStatus({ status: 'active' }).ok).toBe(false);
    expect(cleanCardStatus({ status: 'lost', note: 'x'.repeat(301) }).ok).toBe(false);
  });
  it('rédige l’alerte du cahier de liaison, plus sévère pour un passe', () => {
    expect(lostCardNotice({ code: 'A1', kind: 'client', roomNumber: '101', holder: '' })).toContain('chambre 101');
    expect(lostCardNotice({ code: 'P9', kind: 'passe', roomNumber: null, holder: 'Étage 1' })).toContain('changer les serrures');
  });
});

describe('Objets trouvés', () => {
  const today = '2026-11-22';
  it('contrôle un objet, date par défaut aujourd’hui', () => {
    const r = cleanItem({ description: 'Lunettes noires', place: 'Piscine' }, today);
    expect(r).toEqual({ ok: true, value: { foundOn: today, roomId: null, place: 'Piscine', description: 'Lunettes noires', storage: '' } });
    expect(cleanItem({ description: '' }, today).ok).toBe(false);
    expect(cleanItem({ description: 'x', foundOn: '2027-01-01' }, today).ok).toBe(false);
    expect(cleanItem({ description: 'x', foundOn: 'n’importe quoi' }, today).ok).toBe(false);
    expect(cleanItem({ description: 'x', roomId: 'abc' }, today).ok).toBe(false);
  });
  it('rendre exige un nom ; éliminer n’en garde aucun', () => {
    expect(cleanItemClose({ status: 'returned' }).ok).toBe(false);
    expect(cleanItemClose({ status: 'returned', returnedTo: 'M. Diop' })).toEqual({ ok: true, value: { status: 'returned', returnedTo: 'M. Diop' } });
    expect(cleanItemClose({ status: 'discarded', returnedTo: 'M. Diop' })).toEqual({ ok: true, value: { status: 'discarded', returnedTo: '' } });
    expect(cleanItemClose({ status: 'stored' }).ok).toBe(false);
  });
  it('un objet clos ne se rouvre pas', () => {
    expect(canCloseItem('stored')).toBe(true);
    expect(canCloseItem('returned')).toBe(false);
    expect(canCloseItem('discarded')).toBe(false);
  });
});

describe('Accès', () => {
  it('direction, réception et gouvernante gèrent ; la femme de chambre déclare les objets seulement', () => {
    for (const r of ['direction', 'reception', 'gouvernante'] as const) expect(levelFor(r, 'keys')).toBe('E');
    expect(levelFor('femme_chambre', 'keys')).toBe('P');
    expect(levelFor('technique', 'keys')).toBeNull();
    expect(routePolicy('/api/hotel/cards', 'POST', 'reception')).toBe('allow');
    expect(routePolicy('/api/hotel/lost', 'POST', 'femme_chambre')).toBe('allow'); // périmètre contrôlé dans la route
    expect(routePolicy('/api/hotel/cards', 'GET', 'restaurant')).toBe('deny');
    expect(routePolicy('/admin/hotel/cartes/', 'GET', 'femme_chambre')).toBe('allow');
    expect(routePolicy('/admin/hotel/cartes/', 'GET', 'technique')).toBe('deny');
  });
});
