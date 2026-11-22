import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// Rendu serveur : le contenu (prix, textes, photos) est modifiable depuis /admin.
export default defineConfig({
  site: 'https://lodgedesalmadies.com',
  output: 'server',
  adapter: vercel({ maxDuration: 60 }),
});
