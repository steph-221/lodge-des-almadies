import { describe, expect, it } from 'vitest';
import { ROLES, levelFor, routePolicy, canManageStaff, type Role } from '../src/lib/hotel/permissions';

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
