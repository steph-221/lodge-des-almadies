import { levelFor, type Module, type Role } from './permissions';

export type HotelNavItem = { key: Module; label: string; href: string; ready: boolean };

// Sous-onglets de l'espace Services hôtel. « ready » passe à vrai quand le lot correspondant est livré.
export const HOTEL_NAV: HotelNavItem[] = [
  { key: 'today', label: 'Aujourd’hui', href: '/admin/hotel/', ready: true },
  { key: 'stays', label: 'Réservations', href: '/admin/hotel/reservations/', ready: true },
  { key: 'rooms', label: 'Chambres', href: '/admin/hotel/chambres/', ready: true },
  { key: 'linen', label: 'Linge & stocks', href: '/admin/hotel/linge/', ready: false },
  { key: 'requests', label: 'Demandes', href: '/admin/hotel/demandes/', ready: false },
  { key: 'events', label: 'Groupes & séminaires', href: '/admin/hotel/groupes/', ready: false },
  { key: 'extras', label: 'Extras', href: '/admin/hotel/extras/', ready: false },
  { key: 'team', label: 'Équipe & réglages', href: '/admin/hotel/equipe/', ready: true },
];

export const navFor = (role: Role): HotelNavItem[] => HOTEL_NAV.filter((i) => i.ready && levelFor(role, i.key));
export const upcoming = (role: Role): HotelNavItem[] => HOTEL_NAV.filter((i) => !i.ready && levelFor(role, i.key));
