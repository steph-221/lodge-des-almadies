// Liste les textes français du site public qui n'ont pas encore de traduction anglaise (src/i18n/en.json).
// Usage : npm run i18n:missing            (textes du code et du contenu par défaut)
//         npm run i18n:missing -- fichier.json   (ajoute un contenu exporté de /admin : celui de la production)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SKIP_KEYS = new Set(['href', 'img', 'src', 'slug', 'images', 'carousel', 'heroImage', 'seminaireHeroImage', 'phone', 'phoneHref', 'email', 'maps', 'tripadvisor', 'url', 'menuImages', 'restaurantPhone', 'pageHeroes', 'building']);

export function codeKeys(root = 'src') {
  const out = new Set();
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) { if (!p.includes('admin') && !p.includes('hotel')) walk(p); continue; }
      if (!/\.(astro|ts)$/.test(f) || p.includes('i18n.ts')) continue;
      const src = readFileSync(p, 'utf8');
      // t('…') et t("…") ; les guillemets échappés sont gérés
      for (const m of src.matchAll(/\bt\(\s*('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")/g)) out.add(JSON.parse('"' + m[1].slice(1, -1).replace(/\\'/g, "'").replace(/"/g, '\\"') + '"'));
      // t(cond ? '…' : '…')
      for (const m of src.matchAll(/\bt\([^()'"]*\?\s*('(?:[^'\\\n]|\\.)*')\s*:\s*('(?:[^'\\\n]|\\.)*')/g)) { out.add(m[1].slice(1, -1)); out.add(m[2].slice(1, -1)); }
    }
  };
  walk(root);
  return out;
}

export function contentKeys(tree) {
  const out = new Set();
  const walk = (v, key = '') => {
    if (typeof v === 'string') { if (!SKIP_KEYS.has(key) && /\p{L}/u.test(v)) out.add(v); }
    else if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => { if (!SKIP_KEYS.has(k)) walk(x, k); });
  };
  walk(tree);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dict = JSON.parse(readFileSync('src/i18n/en.json', 'utf8'));
  const keys = new Set([...codeKeys(), ...contentKeys(JSON.parse(readFileSync('src/data/content.default.json', 'utf8')))]);
  if (process.argv[2]) for (const k of contentKeys(JSON.parse(readFileSync(process.argv[2], 'utf8')))) keys.add(k);
  const missing = [...keys].filter((k) => !(k in dict));
  if (!missing.length) console.log(`Toutes les ${keys.size} phrases sont traduites.`);
  else { console.log(`${missing.length} phrase(s) sans traduction anglaise :\n`); for (const k of missing) console.log(JSON.stringify(k)); process.exitCode = 1; }
}
