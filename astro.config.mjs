import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// Rendu serveur : le contenu (prix, textes, photos) est modifiable depuis /admin.
export default defineConfig({
  site: 'https://lodgedesalmadies.com',
  output: 'server',
  adapter: vercel({ maxDuration: 60 }),
  // Anciennes adresses anglaises (mots français) -> adresses anglaises.
  redirects: {
    '/en/tarifs': '/en/rates/',
    '/en/tarifs/': '/en/rates/',
    '/en/tarifs/seminaire': '/en/rates/meetings-events/',
    '/en/tarifs/seminaire/': '/en/rates/meetings-events/',
    '/en/seminaires': '/en/meetings-events/',
    '/en/seminaires/': '/en/meetings-events/',
    '/en/chambres/[slug]': '/en/rooms/[slug]/',
    '/en/galerie': '/en/gallery/',
    '/en/galerie/': '/en/gallery/',
  },
});
