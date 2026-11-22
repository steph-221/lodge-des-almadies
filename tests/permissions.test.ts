import { describe, expect, it } from 'vitest';
import { ROLES, levelFor, routePolicy, canEdit, canManageStaff, type Role } from '../src/lib/hotel/permissions';

describe('matrice rôles × modules', () => {
  it('réserve la zone Site à la direction', () => {
    expect(levelFor('direction', 'site')).toBe('E');
    for (const r of ROLES.filter((x) => x !== 'direction')) expect(levelFor(r, 'site')).toBeNull();
  });

  it('donne à la gouvernante un accès partiel à l’équipe et rien à la réception', () => {
    expect(levelFor('gouvernante', 'team')).toBe('P');
    expect(levelFor('reception', 'team')).toBeNull();
    expect(levelFor('femme_chambre', 'team')).toBeNull();
  });

  it('cache les visites de chambre à la réception et au restaurant', () => {
    expect(levelFor('reception', 'inspections')).toBeNull();
    expect(levelFor('restaurant', 'inspections')).toBeNull();
    expect(levelFor('direction', 'inspections')).toBe('E');
  });
});

describe('routePolicy', () => {
  const allowed = (path: string, method: string, role: Role) => routePolicy(path, method, role) === 'allow';

  it('refuse à une femme de chambre la zone Site et ses API', () => {
    expect(allowed('/api/admin/content', 'PUT', 'femme_chambre')).toBe(false);
    expect(allowed('/api/admin/upload', 'POST', 'reception')).toBe(false);
    expect(allowed('/api/admin/content', 'PUT', 'direction')).toBe(true);
  });

  it('autorise le login sans rôle et /api/hotel/me à tout le personnel', () => {
    expect(routePolicy('/api/admin/login', 'POST', null)).toBe('allow');
    for (const r of ROLES) expect(allowed('/api/hotel/me', 'GET', r)).toBe(true);
  });

  it('laisse la page d’accueil Services hôtel à tout le personnel', () => {
    for (const r of ROLES) expect(allowed('/admin/hotel/', 'GET', r)).toBe(true);
    for (const r of ROLES) expect(allowed('/admin/hotel', 'GET', r)).toBe(true);
  });

  it('protège l’équipe : lecture et écriture selon le rôle', () => {
    expect(allowed('/admin/hotel/equipe/', 'GET', 'direction')).toBe(true);
    expect(allowed('/admin/hotel/equipe/', 'GET', 'gouvernante')).toBe(true);
    expect(allowed('/admin/hotel/equipe/', 'GET', 'reception')).toBe(false);
    expect(allowed('/api/hotel/staff', 'POST', 'direction')).toBe(true);
    expect(allowed('/api/hotel/staff/12', 'PATCH', 'femme_chambre')).toBe(false);
  });

  it('refuse par défaut une route inconnue, même pour la direction', () => {
    expect(allowed('/api/hotel/inconnue', 'GET', 'direction')).toBe(false);
    expect(allowed('/admin/hotel/inconnue/', 'GET', 'direction')).toBe(false);
    expect(allowed('/api/cron/daily', 'GET', 'direction')).toBe(false);
  });

  it('ferme par défaut toute future page /admin/*, sauf la connexion', () => {
    expect(routePolicy('/admin/', 'GET', null)).toBe('allow');
    expect(routePolicy('/admin', 'GET', null)).toBe('allow');
    expect(routePolicy('/admin/nouvelle-page/', 'GET', null)).toBe('deny');
    expect(routePolicy('/admin/nouvelle-page/', 'GET', 'direction')).toBe('deny');
    expect(routePolicy('/admin.js', 'GET', null)).toBe('allow');
  });

  it('refuse sans rôle toute route protégée', () => {
    expect(routePolicy('/api/hotel/me', 'GET', null)).toBe('deny');
    expect(routePolicy('/admin/hotel/', 'GET', null)).toBe('deny');
    expect(routePolicy('/api/admin/content', 'GET', null)).toBe('deny');
  });

  it('ne se laisse pas contourner par un chemin déguisé', () => {
    expect(allowed('/api/hotel/me/../staff', 'GET', 'femme_chambre')).toBe(false);
    expect(allowed('/api/hotel//staff', 'GET', 'femme_chambre')).toBe(false);
    expect(allowed('/API/HOTEL/STAFF', 'GET', 'femme_chambre')).toBe(false);
  });
});

describe('routes chambres et séjours (lot 1a)', () => {
  const allowed = (path: string, method: string, role: Role) => routePolicy(path, method, role) === 'allow';

  it('ne montre jamais les séjours (noms de clients) à la femme de chambre ni à la technique', () => {
    for (const r of ['femme_chambre', 'technique'] as Role[]) {
      expect(allowed('/api/hotel/stays', 'GET', r)).toBe(false);
      expect(allowed('/admin/hotel/reservations/', 'GET', r)).toBe(false);
    }
  });
  it('laisse la femme de chambre lire et avancer ses tâches, mais pas importer ni écrire les séjours', () => {
    expect(allowed('/api/hotel/tasks', 'GET', 'femme_chambre')).toBe(true);
    expect(allowed('/api/hotel/tasks/4', 'PATCH', 'femme_chambre')).toBe(true);
    expect(allowed('/api/hotel/import', 'POST', 'femme_chambre')).toBe(false);
    expect(allowed('/api/hotel/stays', 'POST', 'femme_chambre')).toBe(false);
  });
  it('accorde la lecture seule des séjours à la gouvernante et au restaurant', () => {
    for (const r of ['gouvernante', 'restaurant'] as Role[]) {
      expect(allowed('/api/hotel/stays', 'GET', r)).toBe(true);
      expect(allowed('/api/hotel/stays', 'POST', r)).toBe(false);
      expect(allowed('/api/hotel/import', 'POST', r)).toBe(false);
    }
  });
  it('autorise la réception à saisir séjours et chambres', () => {
    expect(allowed('/api/hotel/stays', 'POST', 'reception')).toBe(true);
    expect(allowed('/api/hotel/rooms', 'POST', 'reception')).toBe(true);
    expect(allowed('/api/hotel/room-types/3', 'PATCH', 'reception')).toBe(true);
  });
  it('canEdit distingue l’écriture complète du périmètre limité', () => {
    expect(canEdit('femme_chambre', 'rooms')).toBe(false);
    expect(canEdit('gouvernante', 'rooms')).toBe(true);
    expect(canEdit('gouvernante', 'stays')).toBe(false);
  });
});

describe('canManageStaff', () => {
  it('permet à la direction de gérer tous les rôles', () => {
    for (const r of ROLES) expect(canManageStaff('direction', r)).toBe(true);
  });
  it('limite la gouvernante aux femmes de chambre', () => {
    expect(canManageStaff('gouvernante', 'femme_chambre')).toBe(true);
    expect(canManageStaff('gouvernante', 'direction')).toBe(false);
    expect(canManageStaff('gouvernante', 'reception')).toBe(false);
    expect(canManageStaff('gouvernante', 'gouvernante')).toBe(false);
  });
  it('refuse aux autres rôles', () => {
    expect(canManageStaff('reception', 'femme_chambre')).toBe(false);
    expect(canManageStaff('technique', 'technique')).toBe(false);
  });
});

describe('routes linge, minibar et extras (lot 1b)', () => {
  const allowed = (path: string, method: string, role: Role) => routePolicy(path, method, role) === 'allow';

  it('réserve l’écriture du linge et des stocks à la direction et à la gouvernante', () => {
    for (const p of ['/api/hotel/items', '/api/hotel/stock', '/api/hotel/templates', '/api/hotel/laundry']) {
      expect(allowed(p, 'POST', 'direction')).toBe(true);
      expect(allowed(p, 'POST', 'gouvernante')).toBe(true);
      expect(allowed(p, 'POST', 'reception')).toBe(false);
      expect(allowed(p, 'POST', 'femme_chambre')).toBe(false);
    }
    expect(allowed('/api/hotel/items/import', 'POST', 'gouvernante')).toBe(true);
    expect(allowed('/api/hotel/items', 'GET', 'reception')).toBe(true);
    expect(allowed('/api/hotel/items', 'GET', 'femme_chambre')).toBe(false);
  });
  it('laisse la femme de chambre relever le minibar mais pas régler la dotation', () => {
    expect(allowed('/api/hotel/minibar', 'POST', 'femme_chambre')).toBe(true);
    expect(allowed('/api/hotel/minibar', 'POST', 'reception')).toBe(false);
    expect(canEdit('femme_chambre', 'linen')).toBe(false);
    expect(canEdit('gouvernante', 'linen')).toBe(true);
  });
  it('limite le restaurant au room service dans les extras', () => {
    expect(allowed('/api/hotel/charges', 'POST', 'restaurant')).toBe(true);
    expect(canEdit('restaurant', 'extras')).toBe(false);
    expect(allowed('/api/hotel/charges', 'GET', 'gouvernante')).toBe(false);
    expect(allowed('/admin/hotel/extras/', 'GET', 'femme_chambre')).toBe(false);
  });
  it('ouvre les pages Linge, Minibar et Extras aux bons rôles', () => {
    expect(allowed('/admin/hotel/linge/', 'GET', 'reception')).toBe(true);
    expect(allowed('/admin/hotel/linge/', 'GET', 'technique')).toBe(false);
    expect(allowed('/admin/hotel/minibar/', 'GET', 'femme_chambre')).toBe(true);
    expect(allowed('/admin/hotel/minibar/', 'GET', 'restaurant')).toBe(false);
  });
});

describe('routes visites de chambre (lot 1c)', () => {
  const allowed = (path: string, method: string, role: Role) => routePolicy(path, method, role) === 'allow';

  it('ouvre l’écran des visites à la direction, à la gouvernante et à la technique seulement', () => {
    for (const r of ['direction', 'gouvernante', 'technique'] as Role[]) expect(allowed('/admin/hotel/visites/', 'GET', r)).toBe(true);
    for (const r of ['reception', 'femme_chambre', 'restaurant'] as Role[]) {
      expect(allowed('/admin/hotel/visites/', 'GET', r)).toBe(false);
      expect(allowed('/api/hotel/inspections', 'GET', r)).toBe(false);
    }
  });
  it('réserve la saisie des visites et les photos à la direction (canEdit)', () => {
    expect(canEdit('direction', 'inspections')).toBe(true);
    expect(canEdit('gouvernante', 'inspections')).toBe(false);
    expect(canEdit('technique', 'inspections')).toBe(false);
  });
  it('ne laisse pas la réception ni la femme de chambre lire les photos', () => {
    for (const r of ['reception', 'femme_chambre', 'restaurant'] as Role[]) expect(allowed('/api/hotel/files/4', 'GET', r)).toBe(false);
    expect(allowed('/api/hotel/files/4', 'GET', 'direction')).toBe(true);
  });
});

describe('lot 2 : brief, liaison, cron', () => {
  const allowed = (path: string, method: string, role: Role) => routePolicy(path, method, role) === 'allow';
  it('laisse tout le personnel lire « Aujourd’hui » et le cahier de liaison, et y écrire', () => {
    for (const r of ['direction', 'reception', 'gouvernante', 'femme_chambre', 'technique', 'restaurant'] as Role[]) {
      expect(allowed('/api/hotel/today', 'GET', r)).toBe(true);
      expect(allowed('/api/hotel/logbook', 'GET', r)).toBe(true);
      expect(allowed('/api/hotel/logbook', 'POST', r)).toBe(true);
    }
  });
  it('refuse toute écriture sur « Aujourd’hui » (lecture seule)', () => {
    expect(allowed('/api/hotel/today', 'POST', 'direction')).toBe(false);
    expect(allowed('/api/hotel/today', 'POST', 'reception')).toBe(false);
  });
  it('réserve épingler et retirer un message à ceux qui ont l’écriture complète (canEdit)', () => {
    for (const r of ['direction', 'reception', 'gouvernante'] as Role[]) expect(canEdit(r, 'logbook')).toBe(true);
    for (const r of ['femme_chambre', 'technique', 'restaurant'] as Role[]) expect(canEdit(r, 'logbook')).toBe(false);
  });
  it('réserve les destinataires de l’e-mail à la direction', () => {
    expect(allowed('/api/hotel/brief', 'PUT', 'direction')).toBe(true);
    for (const r of ['gouvernante', 'femme_chambre', 'technique', 'restaurant'] as Role[]) expect(allowed('/api/hotel/brief', 'PUT', r)).toBe(false);
    expect(canEdit('reception', 'settings')).toBe(false);
  });
  it('ferme /api/cron à toute session : seul le secret du cron passe par le middleware', () => {
    for (const r of ['direction', 'reception', 'gouvernante', 'femme_chambre', 'technique', 'restaurant'] as Role[]) expect(allowed('/api/cron/daily', 'GET', r)).toBe(false);
  });
});
