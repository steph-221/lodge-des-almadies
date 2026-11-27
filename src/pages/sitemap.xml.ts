import type { APIRoute } from 'astro';
import { getContent } from '../lib/content';

export const prerender = false;

const ORIGIN = 'https://lodgedesalmadies.com';

// Chaque page existe en français (racine) et en anglais (/en/) ; on le signale à Google avec les liens hreflang.
export const GET: APIRoute = async () => {
  const c = await getContent();
  const paths = ['/', '/hotel/', '/tarifs/', '/tarifs/seminaire/', '/services/', '/restaurant/', '/boutiques/', '/seminaires/', '/galerie/', '/faq/', '/contact/', ...c.rooms.map((r) => `/chambres/${r.slug}/`)];
  const en = (p: string) => (p === '/' ? '/en/' : `/en${p}`);
  const entry = (loc: string, p: string) =>
    `<url><loc>${ORIGIN}${loc}</loc>` +
    `<xhtml:link rel="alternate" hreflang="fr" href="${ORIGIN}${p}"/>` +
    `<xhtml:link rel="alternate" hreflang="en" href="${ORIGIN}${en(p)}"/>` +
    `<xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}${p}"/></url>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${paths.map((p) => entry(p, p) + entry(en(p), p)).join('')}</urlset>`;
  return new Response(xml, { headers: { 'content-type': 'application/xml' } });
};
