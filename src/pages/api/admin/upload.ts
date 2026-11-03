import type { APIRoute } from 'astro';
import { mkdir, writeFile } from 'node:fs/promises';
import { put } from '@vercel/blob';
import { COOKIE, isAdmin, sameOrigin } from '../../../lib/auth';

export const prerender = false;

const env = (k: string): string | undefined => (import.meta.env as any)[k] ?? process.env[k];
const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const TYPES: Record<string, { ext: string; magic: number[] }> = {
  'image/jpeg': { ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  'image/png': { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
  'image/webp': { ext: 'webp', magic: [0x52, 0x49, 0x46, 0x46] },
};
const MAX = 4 * 1024 * 1024; // limite de corps des fonctions Vercel : 4,5 Mo (l'admin compresse avant envoi)

export const POST: APIRoute = async ({ request, cookies }) => {
  if (!sameOrigin(request) || !isAdmin(cookies.get(COOKIE)?.value)) return json(401, { error: 'unauthorized' });
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return json(400, { error: 'Aucun fichier.' });
  const t = TYPES[file.type];
  if (!t) return json(400, { error: 'Format accepté : JPEG, PNG ou WebP.' });
  if (file.size > MAX) return json(400, { error: 'Image trop lourde (4 Mo maximum).' });
  const buf = Buffer.from(await file.arrayBuffer());
  if (!t.magic.every((b, i) => buf[i] === b)) return json(400, { error: 'Le fichier n’est pas une image valide.' });

  const base = (file.name.replace(/\.[^.]+$/, '').normalize('NFD').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').slice(0, 40) || 'photo');
  const name = `${Date.now().toString(36)}-${base}.${t.ext}`;

  if (env('BLOB_READ_WRITE_TOKEN')) {
    const blob = await put(`img/${name}`, buf, { access: 'public', contentType: file.type, addRandomSuffix: false });
    return json(200, { src: blob.url });
  }
  await mkdir('public/img/uploads', { recursive: true });
  await writeFile(`public/img/uploads/${name}`, buf);
  return json(200, { src: `/img/uploads/${name}` });
};
