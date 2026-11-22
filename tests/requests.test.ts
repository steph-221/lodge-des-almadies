import { describe, expect, it } from 'vitest';
import {
  alertText, byPriority, canIssueTransition, canTransition, cleanCatalog, cleanGuestRequest, cleanGuide, cleanIssue, guestUrl,
  isTokenShape, pickLang, roomOpenForGuest, servicesFor,
} from '../src/lib/hotel/requests-core';

describe('services par rôle', () => {
  it('direction et réception voient tout, les autres leur périmètre', () => {
    expect(servicesFor('direction')).toHaveLength(4);
    expect(servicesFor('reception')).toHaveLength(4);
    expect(servicesFor('femme_chambre')).toEqual(['housekeeping']);
    expect(servicesFor('gouvernante')).toEqual(['housekeeping']);
    expect(servicesFor('technique')).toEqual(['technique']);
    expect(servicesFor('restaurant')).toEqual(['restaurant']);
  });
});

describe('états d’une demande', () => {
  it('avance sans retour en arrière', () => {
    expect(canTransition('new', 'doing')).toBe(true);
    expect(canTransition('new', 'done')).toBe(true);
    expect(canTransition('doing', 'done')).toBe(true);
    expect(canTransition('done', 'new')).toBe(false);
    expect(canTransition('done', 'cancelled')).toBe(false);
    expect(canTransition('cancelled', 'doing')).toBe(false);
  });
  it('une panne résolue ne se rouvre pas', () => {
    expect(canIssueTransition('open', 'doing')).toBe(true);
    expect(canIssueTransition('doing', 'done')).toBe(true);
    expect(canIssueTransition('done', 'open')).toBe(false);
    expect(canIssueTransition('doing', 'open')).toBe(false);
  });
});

describe('langue de la page client', () => {
  it('le paramètre prime, puis le navigateur, sinon le français', () => {
    expect(pickLang('en', 'fr-FR')).toBe('en');
    expect(pickLang(null, 'en-GB,en;q=0.9')).toBe('en');
    expect(pickLang(null, 'fr-FR,fr;q=0.9')).toBe('fr');
    expect(pickLang('de', 'de-DE')).toBe('fr');
    expect(pickLang(null, null)).toBe('fr');
  });
});

describe('chambre ouverte aux demandes', () => {
  const stays = [{ arrival: '2026-11-20', departure: '2026-11-23' }];
  it('ouverte du jour d’arrivée au jour du départ inclus', () => {
    expect(roomOpenForGuest(stays, '2026-11-20')).toBe(true);
    expect(roomOpenForGuest(stays, '2026-11-22')).toBe(true);
    expect(roomOpenForGuest(stays, '2026-11-23')).toBe(true);
  });
  it('fermée avant l’arrivée, après le départ et sans séjour', () => {
    expect(roomOpenForGuest(stays, '2026-11-19')).toBe(false);
    expect(roomOpenForGuest(stays, '2026-11-24')).toBe(false);
    expect(roomOpenForGuest([], '2026-11-22')).toBe(false);
  });
});

describe('demande du client', () => {
  it('accepte une demande valide et prend 1 par défaut', () => {
    expect(cleanGuestRequest({ catalogId: 3 })).toEqual({ ok: true, value: { catalogId: 3, qty: 1, note: '' } });
    expect(cleanGuestRequest({ catalogId: '4', qty: '2', note: '  7 h  ' })).toEqual({ ok: true, value: { catalogId: 4, qty: 2, note: '7 h' } });
  });
  it('refuse les valeurs invalides, dans la langue du client', () => {
    expect(cleanGuestRequest({}).ok).toBe(false);
    expect(cleanGuestRequest({ catalogId: 1, qty: 0 }).ok).toBe(false);
    expect(cleanGuestRequest({ catalogId: 1, qty: 21 }).ok).toBe(false);
    expect(cleanGuestRequest({ catalogId: 1, note: 'x'.repeat(301) }).ok).toBe(false);
    const en = cleanGuestRequest({}, 'en');
    expect(en.ok === false && en.error).toBe('Please choose a request.');
  });
});

describe('catalogue et guide', () => {
  it('le prix n’existe que pour le room service', () => {
    const a = cleanCatalog({ labelFr: 'Club sandwich', kind: 'room_service', service: 'restaurant', price: '6500' });
    expect(a.ok && a.value.price).toBe(6500);
    const b = cleanCatalog({ labelFr: 'Oreiller', kind: 'service', service: 'housekeeping', price: 1000 });
    expect(b.ok && b.value.price).toBeNull();
  });
  it('refuse un libellé vide, un service inconnu et un prix négatif', () => {
    expect(cleanCatalog({ labelFr: '', service: 'reception' }).ok).toBe(false);
    expect(cleanCatalog({ labelFr: 'x', service: 'cuisine' }).ok).toBe(false);
    expect(cleanCatalog({ labelFr: 'x', kind: 'room_service', service: 'restaurant', price: -1 }).ok).toBe(false);
  });
  it('le guide exige un titre français et réserve par défaut aux chambres occupées', () => {
    expect(cleanGuide({ titleFr: '' }).ok).toBe(false);
    const g = cleanGuide({ titleFr: 'Wi-Fi', bodyFr: 'x' });
    expect(g.ok && g.value.occupiedOnly).toBe(true);
    const o = cleanGuide({ titleFr: 'Horaires', occupiedOnly: false });
    expect(o.ok && o.value.occupiedOnly).toBe(false);
  });
});

describe('panne', () => {
  it('exige une chambre ou un lieu, et un titre', () => {
    expect(cleanIssue({ title: 'Fuite' }, true).ok).toBe(false);
    expect(cleanIssue({ place: 'Piscine', title: '' }, true).ok).toBe(false);
    expect(cleanIssue({ place: 'Piscine', title: 'Pompe' }, true).ok).toBe(true);
    expect(cleanIssue({ roomId: 5, title: 'Clim' }, true).ok).toBe(true);
  });
  it('seul un rôle en écriture complète bloque une chambre, et seulement une chambre', () => {
    expect(cleanIssue({ roomId: 5, title: 'Clim', blocksRoom: true }, false).ok).toBe(false);
    expect(cleanIssue({ roomId: 5, title: 'Clim', blocksRoom: true }, true).ok).toBe(true);
    expect(cleanIssue({ place: 'Piscine', title: 'Pompe', blocksRoom: true }, true).ok).toBe(false);
  });
  it('trie les urgentes d’abord puis les plus anciennes', () => {
    const l = [
      { priority: 'normal' as const, createdAt: '2026-11-20T08:00:00Z' },
      { priority: 'urgent' as const, createdAt: '2026-11-22T08:00:00Z' },
      { priority: 'normal' as const, createdAt: '2026-11-19T08:00:00Z' },
    ].sort(byPriority);
    expect(l.map((x) => x.priority)).toEqual(['urgent', 'normal', 'normal']);
    expect(l[1].createdAt < l[2].createdAt).toBe(true);
  });
});

describe('jeton du QR et alertes', () => {
  it('reconnaît la forme d’un jeton et construit l’adresse', () => {
    expect(isTokenShape('abcdefghijklmnopqrstuv')).toBe(true);
    expect(isTokenShape('court')).toBe(false);
    expect(isTokenShape('abcdefghijklmnopqrst../')).toBe(false);
    expect(guestUrl('https://exemple.test/', 'T')).toBe('https://exemple.test/c/T');
  });
  it('l’alerte cite la chambre et le libellé, sans nom de client', () => {
    const a = alertText('request', { room: '12', title: 'Oreiller', qty: 2, note: 'ferme' }, 'https://exemple.test');
    expect(a.subject).toContain('chambre 12');
    expect(a.text).toContain('Oreiller ×2');
    expect(a.text).toContain('/admin/hotel/demandes/');
    const i = alertText('issue', { room: null, title: 'Pompe', priority: 'urgent' }, 'https://exemple.test');
    expect(i.subject).toContain('urgente');
    expect(i.text).toContain('/admin/hotel/pannes/');
  });
});
