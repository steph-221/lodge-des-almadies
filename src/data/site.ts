export const site = {
  name: 'Le Lodge des Almadies',
  address: 'Route des Almadies, Dakar, Sénégal',
  phone: '(+221) 33 869 03 45',
  phoneHref: '+221338690345',
  email: 'hotel@lodgedesalmadies.com',
  tripadvisor:
    'https://www.tripadvisor.fr/Hotel_Review-g293831-d1554223-Reviews-Le_Lodge_des_Almadies-Dakar_Dakar_Region.html',
};

export const nav = [
  { href: '/', label: 'Accueil' },
  { href: '/hotel/', label: "L'hôtel" },
  { href: '/chambres/suites/', label: 'Suites' },
  { href: '/chambres/double/', label: 'Double' },
  { href: '/chambres/twin/', label: 'Twin' },
  { href: '/seminaires/', label: 'Séminaires' },
  { href: '/galerie/', label: 'Galerie' },
  { href: '/faq/', label: 'FAQ' },
  { href: '/contact/', label: 'Contact' },
];

export interface Room {
  slug: string;
  name: string;
  intro: string;
  guests: string;
  beds: string;
  equipment: string[];
  prices: { label: string; fcfa: string; eur: string }[];
  images: string[];
}

const common = [
  'Écran plat LCD et câble satellite',
  'Coffre individuel',
  'Climatisation',
  'Wi-Fi haut débit gratuit',
  'Bureau',
  'Moustiquaire',
];

export const rooms: Room[] = [
  {
    slug: 'suites',
    name: 'Suites',
    intro:
      'Trois suites spacieuses et calmes, à la décoration raffinée et personnalisée. L’une d’elles dispose d’un petit salon et d’une terrasse privée donnant sur la piscine. Lit supplémentaire possible sur demande.',
    guests: '2 personnes max.',
    beds: 'Lit king-size',
    equipment: ['Minibar', 'Bouilloire', ...common, 'Sèche-cheveux et fer à repasser sur demande', 'Corbeille de fruits à l’arrivée'],
    prices: [
      { label: 'Côté terrasse / piscine', fcfa: '78 000 FCFA', eur: '≈ 119 €' },
      { label: 'Côté cour', fcfa: '89 000 FCFA', eur: '≈ 136 €' },
    ],
    images: ['suite-01', 'suite-02', 'suite-03', 'suite-04', 'suite-05'],
  },
  {
    slug: 'double',
    name: 'Chambres Double',
    intro:
      'Toutes les commodités nécessaires. Certaines chambres ont un balcon, d’autres communiquent avec une chambre twin, idéal pour les familles avec enfants. Lit supplémentaire possible sur demande.',
    guests: '2 personnes max.',
    beds: 'Lit double',
    equipment: common,
    prices: [
      { label: 'Côté route', fcfa: '49 000 FCFA', eur: '≈ 75 €' },
      { label: 'Côté piscine', fcfa: '53 000 FCFA', eur: '≈ 81 €' },
      { label: 'Chambre spacieuse avec minibar', fcfa: '63 000 FCFA', eur: '≈ 96 €' },
    ],
    images: ['double-01', 'double-02', 'double-03', 'double-04', 'double-05'],
  },
  {
    slug: 'twin',
    name: 'Chambres Twin',
    intro:
      'Pensées pour les voyages d’affaires et les séjours entre amis. Certaines ont un balcon. Sur demande, la chambre peut être transformée en double, et un lit supplémentaire ajouté.',
    guests: '2 personnes max.',
    beds: 'Deux lits individuels',
    equipment: common,
    prices: [
      { label: 'Côté route', fcfa: '49 000 FCFA', eur: '≈ 75 €' },
      { label: 'Côté piscine', fcfa: '53 000 FCFA', eur: '≈ 81 €' },
      { label: 'Annexe, côté cour ou route', fcfa: '57 000 FCFA', eur: '≈ 87 €' },
      { label: 'Chambre spacieuse avec minibar', fcfa: '63 000 FCFA', eur: '≈ 96 €' },
    ],
    images: ['twin-01', 'twin-02', 'twin-03', 'twin-04', 'twin-05'],
  },
];

const photos = ['049_DSC_2308', '041_DSC_2291-2', '3-', '099_DSC_2424', '034_DSC_2263', 'dsc_7888', 'dsc_8082', '033_DSC_2259', '9-chambres1', '2-chambres4', '1-chambres', '101_DSC_2420', '077_DSC_2360', '5-salle-de-seminaire4', '028_DSC_2233', '068_DSC_2354'];

export const gallery = [
  { src: 'g-apero', alt: 'Apéro sur le balcon' },
  { src: 'g-relax', alt: 'Espace détente' },
  { src: 'g-decor', alt: 'Un décor raffiné' },
  { src: 'g-reception', alt: 'La réception' },
  { src: 'g-seminaires', alt: 'Salle de séminaire' },
  ...photos.map((n) => ({ src: `p-${n}`, alt: 'Le Lodge des Almadies' })),
  ...['01', '02', '03', '04', '05'].map((n) => ({ src: `b-${n}`, alt: 'Les boutiques du Lodge' })),
];
