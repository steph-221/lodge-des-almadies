// Envoi d'e-mails par Resend (appel direct, sans dépendance). Serveur uniquement.
import { env } from './env';

export const mailConfigured = (): boolean => Boolean(env('RESEND_API_KEY') && env('CONTACT_FROM'));

export async function sendMail(m: { to: string[]; subject: string; text: string; html: string }): Promise<void> {
  const key = env('RESEND_API_KEY');
  const from = env('CONTACT_FROM');
  if (!key || !from) throw new Error('E-mail non configuré (RESEND_API_KEY, CONTACT_FROM).');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: m.to, subject: m.subject, text: m.text, html: m.html }),
  });
  if (!r.ok) throw new Error(`Resend : ${r.status}.`);
}
