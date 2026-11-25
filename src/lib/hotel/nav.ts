import { levelFor, type Module, type Role } from './permissions';

export type HotelNavItem = { key: Module; label: string; href: string; ready: boolean; icon: string; help: string };

// Sous-onglets de l'espace Services hôtel. « ready » passe à vrai quand le lot correspondant est livré.
export const HOTEL_NAV: HotelNavItem[] = [
  { key: 'today', label: 'Aujourd’hui', href: '/admin/hotel/', ready: true, icon: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', help: "Ce qui se passe aujourd’hui : arrivées, départs, ménage et alertes." },
  { key: 'stays', label: 'Réservations', href: '/admin/hotel/reservations/', ready: true, icon: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>', help: "Séjours en cours et à venir, import des réservations." },
  { key: 'rooms', label: 'Chambres', href: '/admin/hotel/chambres/', ready: true, icon: '<path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/>', help: "Types de chambres, tarifs, équipements et état de chaque chambre." },
  { key: 'inspections', label: 'Visites', href: '/admin/hotel/visites/', ready: true, icon: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', help: "Visites de contrôle des chambres et défauts à corriger." },
  { key: 'linen', label: 'Linge & stocks', href: '/admin/hotel/linge/', ready: true, icon: '<path d="M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8"/>', help: "Linge, blanchisserie et stocks de consommables." },
  { key: 'minibar', label: 'Minibar', href: '/admin/hotel/minibar/', ready: true, icon: '<path d="M5 3h14l-2 18H7zM6 9h12"/>', help: "Relevé du minibar et consommations à facturer." },
  { key: 'requests', label: 'Demandes', href: '/admin/hotel/demandes/', ready: true, icon: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"/>', help: "Demandes des clients faites par QR code." },
  { key: 'maintenance', label: 'Pannes', href: '/admin/hotel/pannes/', ready: true, icon: '<path d="M14 6a4 4 0 0 0 5 5l-9 9a2.1 2.1 0 0 1-3-3l9-9z"/>', help: "Pannes signalées et maintenance." },
  { key: 'events', label: 'Groupes & séminaires', href: '/admin/hotel/groupes/', ready: true, icon: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-4 3-6 7-6s7 2 7 6M17 5a3.5 3.5 0 0 1 0 6M22 20c0-3-1.5-5-4-5.6"/>', help: "Dossiers de groupes, séminaires, devis et feuilles de fonction." },
  { key: 'sheets', label: 'Fiches papier', href: '/admin/hotel/fiches/', ready: true, icon: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6"/>', help: "Fiches de ménage papier : impression et validation." },
  { key: 'keys', label: 'Cartes & objets trouvés', href: '/admin/hotel/cartes/', ready: true, icon: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v3"/>', help: "Cartes magnétiques et objets trouvés." },
  { key: 'extras', label: 'Extras', href: '/admin/hotel/extras/', ready: true, icon: '<path d="M12 5v14M5 12h14"/>', help: "Prestations supplémentaires facturables." },
  { key: 'team', label: 'Équipe & réglages', href: '/admin/hotel/equipe/', ready: true, icon: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>', help: "Comptes du personnel, droits et réglages." },
];

export const navFor = (role: Role): HotelNavItem[] => HOTEL_NAV.filter((i) => i.ready && levelFor(role, i.key));
export const upcoming = (role: Role): HotelNavItem[] => HOTEL_NAV.filter((i) => !i.ready && levelFor(role, i.key));
