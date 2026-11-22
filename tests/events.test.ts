import { describe, expect, it } from 'vitest';
import content from '../src/data/content.default.json';
import {
  blocksSpace, cleanAttendee, cleanBlock, cleanEvent, cleanLine, cleanSlot, cleanSpace, computeQuote, eventReference, parseAttendees,
  slotsConflict, suggestLines, type QuoteLine,
} from '../src/lib/hotel/events-core';
import { levelFor, routePolicy } from '../src/lib/hotel/permissions';

describe('Devis', () => {
  it('retrouve l’exemple de budget du site (journée d’étude, 20 personnes)', () => {
    const ex = content.tarifs.budgetExample;
    const attendu = ex.lines.reduce((s, l) => s + l.fcfa, 0);
    // Salle et pauses viennent des tarifs du site ; le déjeuner (absent de la liste des tarifs) s'ajoute à la main.
    const lines: QuoteLine[] = suggestLines(content.tarifs.seminaire, { days: 1, people: 20, breaksPerDay: 2 });
    const dejeuner = ex.lines.find((l) => /déjeuner/i.test(l.label))!;
    lines.push({ label: 'Déjeuner menu', detail: 'Par personne', unitFcfa: dejeuner.fcfa / 20, qty: 20 });
    expect(computeQuote(lines).total).toBe(attendu);
  });
  it('calcule les totaux par ligne', () => {
    const q = computeQuote([{ label: 'Salle', detail: '', unitFcfa: 130000, qty: 2 }, { label: 'Pause', detail: '', unitFcfa: 5500, qty: 0 }]);
    expect(q.lines.map((l) => l.total)).toEqual([260000, 0]);
    expect(q.total).toBe(260000);
    expect(computeQuote([]).total).toBe(0);
  });
  it('multiplie les tarifs « par personne » par les jours et les pauses', () => {
    const l = suggestLines([{ label: 'Pause-café', fcfa: 5500, detail: 'Par personne' }, { label: 'Salle', fcfa: 1000, detail: 'Par jour' }], { days: 2, people: 10, breaksPerDay: 2 });
    expect(l[0].qty).toBe(40);
    expect(l[1].qty).toBe(2);
  });
});

describe('Créneaux', () => {
  const a = { spaceId: 1, date: '2027-03-10', start: '09:00', end: '12:00' };
  it('refuse un chevauchement dans la même salle', () => {
    expect(slotsConflict(a, { ...a, start: '11:00', end: '14:00' })).toBe(true);
    expect(slotsConflict(a, { ...a, start: '10:00', end: '11:00' })).toBe(true);
  });
  it('accepte fin = début, un autre jour ou une autre salle', () => {
    expect(slotsConflict(a, { ...a, start: '12:00', end: '15:00' })).toBe(false);
    expect(slotsConflict(a, { ...a, date: '2027-03-11' })).toBe(false);
    expect(slotsConflict(a, { ...a, spaceId: 2 })).toBe(false);
  });
  it('seuls option, devis envoyé, confirmé et terminé retiennent la salle', () => {
    expect(['request', 'option', 'quoted', 'confirmed', 'done', 'cancelled'].map((s) => blocksSpace(s as never))).toEqual([false, true, true, true, true, false]);
  });
  it('contrôle un créneau', () => {
    expect(cleanSlot({ spaceId: 1, date: '2027-03-10', start: '9h', end: '12:30', label: 'Atelier' })).toEqual({ ok: true, value: { spaceId: 1, date: '2027-03-10', start: '09:00', end: '12:30', label: 'Atelier' } });
    expect(cleanSlot({ spaceId: 1, date: '2027-03-10', start: '12:00', end: '09:00' }).ok).toBe(false);
    expect(cleanSlot({ spaceId: 0, date: '2027-03-10', start: '09:00', end: '10:00' }).ok).toBe(false);
    expect(cleanSlot({ spaceId: 1, date: '', start: '09:00', end: '10:00' }).ok).toBe(false);
  });
});

describe('Saisies', () => {
  it('contrôle un dossier', () => {
    const ok = cleanEvent({ title: 'Séminaire annuel', clientName: 'Société X', attendees: '25', contactEmail: 'a@b.sn', optionUntil: '15/03/2027' });
    expect(ok.ok && ok.value.attendees).toBe(25);
    expect(ok.ok && ok.value.optionUntil).toBe('2027-03-15');
    expect(cleanEvent({ title: '', clientName: 'X' }).ok).toBe(false);
    expect(cleanEvent({ title: 'T', clientName: 'X', attendees: 0 }).ok).toBe(false);
    expect(cleanEvent({ title: 'T', clientName: 'X', contactEmail: 'pas-un-mail' }).ok).toBe(false);
  });
  it('contrôle lignes, salle, bloc de chambres', () => {
    expect(cleanLine({ label: 'Salle', unitFcfa: '130000', qty: '2' })).toMatchObject({ ok: true, value: { unitFcfa: 130000, qty: 2 } });
    expect(cleanLine({ label: 'Salle', unitFcfa: -1 }).ok).toBe(false);
    expect(cleanLine({ label: 'Salle', unitFcfa: 1.5 }).ok).toBe(false);
    expect(cleanSpace({ name: 'Salle', capacity: 40 }).ok).toBe(true);
    expect(cleanSpace({ name: ' ' }).ok).toBe(false);
    expect(cleanBlock({ rooms: 5, arrival: '2027-03-10', departure: '2027-03-12' }).ok).toBe(true);
    expect(cleanBlock({ rooms: 5, arrival: '2027-03-12', departure: '2027-03-10' }).ok).toBe(false);
  });
  it('lit une liste de participants collée', () => {
    const r = parseAttendees('Awa Diop;Société X;sans porc\nMoussa Ndiaye\t\t\n\nFatou Sow');
    expect(r.ok && r.value.map((a) => a.name)).toEqual(['Awa Diop', 'Moussa Ndiaye', 'Fatou Sow']);
    expect(r.ok && r.value[0].diet).toBe('sans porc');
    expect(cleanAttendee({ name: '' }).ok).toBe(false);
  });
  it('numérote les dossiers', () => {
    expect(eventReference(2027, 7)).toBe('GRP-2027-0007');
  });
});

describe('Accès', () => {
  it('la direction et la réception écrivent, les autres lisent, la technique et le ménage n’écrivent pas', () => {
    expect(routePolicy('/api/hotel/events', 'POST', 'reception')).toBe('allow');
    expect(routePolicy('/api/hotel/events', 'POST', 'restaurant')).toBe('deny');
    expect(routePolicy('/api/hotel/events', 'GET', 'restaurant')).toBe('allow');
    expect(routePolicy('/api/hotel/events', 'GET', 'femme_chambre')).toBe('deny');
    expect(routePolicy('/api/hotel/spaces', 'POST', 'technique')).toBe('deny');
    expect(routePolicy('/admin/hotel/groupes/', 'GET', 'technique')).toBe('allow');
    expect(routePolicy('/admin/hotel/groupes/', 'GET', 'femme_chambre')).toBe('deny');
    expect(levelFor('gouvernante', 'events')).toBe('L');
  });
});
