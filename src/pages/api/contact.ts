import type { APIRoute } from 'astro';
import { getContent } from '../../lib/content';

export const prerender = false;

const env = (k: string): string | undefined => (import.meta.env as any)[k] ?? process.env[k];
const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const LABEL: Record<string, string> = { sejour: 'Séjour', seminaire: 'Séminaire', autre: 'Autre' };

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const secret = env('TURNSTILE_SECRET');
  const resendKey = env('RESEND_API_KEY');
  const from = env('CONTACT_FROM');
  // Tant que tout n'est pas configuré, le formulaire retombe sur mailto: côté navigateur.
  if (!secret || !resendKey || !from) return json(503, { error: 'not_configured' });

  let d: Record<string, unknown>;
  try { d = await request.json(); } catch { return json(400, { error: 'bad_request' }); }

  // Anti-spam : honeypot + délai minimal de remplissage.
  if (clean(d.website, 50) || Number(d.elapsed) < 2500) return json(200, { ok: true });

  const token = clean(d['cf-turnstile-response'], 2048);
  if (!token) return json(400, { error: 'captcha', message: 'Vérification anti-spam manquante.' });
  const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret, response: token, remoteip: clientAddress ?? '' }),
  }).then((r) => r.json() as Promise<{ success: boolean }>).catch(() => ({ success: false }));
  if (!verify.success) return json(400, { error: 'captcha', message: 'Vérification anti-spam échouée, merci de réessayer.' });

  const objet = LABEL[clean(d.objet, 20)] ? clean(d.objet, 20) : 'autre';
  const nom = clean(d.nom, 120);
  const email = clean(d.email, 160);
  const message = clean(d.message, 3000);
  if (!nom || !message || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
    return json(400, { error: 'invalid', message: 'Merci de vérifier les champs du formulaire.' });
  }
  // Le visiteur écrit depuis la version anglaise du site : l'équipe répond en anglais.
  const english = clean(d.lang, 2) === 'en';
  const lines: [string, string][] = [
    ...(english ? ([['Langue', 'Anglais (EN) : répondre en anglais']] as [string, string][]) : []),
    ['Objet', LABEL[objet]], ['Nom', nom], ['E-mail', email], ['Téléphone', clean(d.telephone, 40)],
    ...(objet === 'seminaire'
      ? ([['Date souhaitée', clean(d.date_seminaire, 20)], ['Participants', clean(d.participants, 5)]] as [string, string][])
      : ([['Arrivée', clean(d.arrivee, 20)], ['Départ', clean(d.depart, 20)]] as [string, string][])),
  ];
  const to = (await getContent()).site.email;
  const html = `<table>${lines.filter(([, v]) => v).map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('')}</table><p style="white-space:pre-wrap">${esc(message)}</p>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: [to], reply_to: email, subject: `[${LABEL[objet]}]${english ? ' [EN]' : ''} Demande de ${nom}`, html }),
  });
  if (!res.ok) return json(502, { error: 'send_failed', message: 'Envoi impossible pour le moment. Écrivez-nous à ' + to + '.' });
  return json(200, { ok: true });
};
