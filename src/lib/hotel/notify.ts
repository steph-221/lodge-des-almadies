// Alertes par e-mail vers les services (WhatsApp viendra au lot 3b derrière la même fonction). Serveur uniquement.
import { env } from '../env';
import { mailConfigured, sendMail } from '../mail';
import { sql } from '../db';
import { alertText, isService, SERVICES, type Priority, type Service } from './requests-core';
import { parseRecipients } from './today';

export const ALERTS_KEY = 'alert_emails';

export type AlertEmails = Record<Service, string[]>;

export async function getAlertEmails(): Promise<AlertEmails> {
  const out = Object.fromEntries(SERVICES.map((s) => [s, [] as string[]])) as AlertEmails;
  const r = (await sql().query(`select value from settings where key = $1`, [ALERTS_KEY])) as { value: unknown }[];
  const v = r[0]?.value;
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, list] of Object.entries(v as Record<string, unknown>)) {
      if (isService(k) && Array.isArray(list)) out[k] = list.filter((x): x is string => typeof x === 'string');
    }
  }
  return out;
}

export async function setAlertEmails(input: Record<string, unknown>, staffId: number | null): Promise<{ value: AlertEmails } | { error: string }> {
  const value = Object.fromEntries(SERVICES.map((s) => [s, [] as string[]])) as AlertEmails;
  for (const s of SERVICES) {
    const raw = input[s];
    const p = parseRecipients(typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.join('\n') : '');
    if (!p.ok) return { error: `${s} : ${p.error}` };
    value[s] = p.value;
  }
  await sql().query(
    `insert into settings (key, value, updated_by) values ($1, $2::jsonb, $3)
     on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`,
    [ALERTS_KEY, JSON.stringify(value), staffId && staffId > 0 ? staffId : null],
  );
  return { value };
}

// Envoie l'alerte au service concerné. Jamais bloquant : un échec d'envoi est consigné mais ne fait pas échouer la demande.
export async function notifyService(
  service: Service, kind: 'request' | 'issue',
  p: { room: string | null; title: string; qty?: number; note?: string; priority?: Priority }, origin: string,
): Promise<'envoyé' | 'inactif' | 'erreur'> {
  try {
    if (!mailConfigured()) return 'inactif';
    const to = (await getAlertEmails())[service];
    if (!to.length) return 'inactif';
    const a = alertText(kind, p, origin);
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    await sendMail({ to, subject: a.subject, text: a.text, html: `<p>${esc(a.text).replace(/\n/g, '<br>')}</p>` });
    return 'envoyé';
  } catch (e) {
    console.error('[alerte]', (e as Error).message);
    return 'erreur';
  }
}

// Adresse publique de l'application : variable PUBLIC_APP_ORIGIN, sinon l'adresse de la requête.
export const appOrigin = (fallback: string): string => (env('PUBLIC_APP_ORIGIN') || fallback).replace(/\/+$/, '');
