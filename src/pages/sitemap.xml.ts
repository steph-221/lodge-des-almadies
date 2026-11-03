import type { APIRoute } from 'astro';
import { getContent } from '../lib/content';

export const prerender = false;

export const GET: APIRoute = async () => {
  const c = await getContent();
  const paths = ['/', '/hotel/', '/tarifs/', '/tarifs/seminaire/', '/services/', '/restaurant/', '/boutiques/', '/seminaires/', '/galerie/', '/faq/', '/contact/', ...c.rooms.map((r) => `/chambres/${r.slug}/`)];
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((p) => `<url><loc>https://lodgedesalmadies.com${p}</loc></url>`).join('')}</urlset>`;
  return new Response(xml, { headers: { 'content-type': 'application/xml' } });
};
