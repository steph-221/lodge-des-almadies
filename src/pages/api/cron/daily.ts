import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';
import { driveConfigured } from '../../../lib/drive';
import { env } from '../../../lib/env';
import { json } from '../../../lib/http';
import { mailConfigured, sendMail } from '../../../lib/mail';
import { backupToDrive } from '../../../lib/hotel/backup';
import { computeBrief, getRecipients, toEmailData } from '../../../lib/hotel/brief';
import { todayDakar } from '../../../lib/hotel/tasks';
import { briefEmail } from '../../../lib/hotel/today';

export const prerender = false;

type Outcome = { status: 'fait' | 'déjà fait' | 'inactif' | 'erreur'; detail?: string };

// Une tâche par jour au plus (clé job + date). En cas d'échec la réservation est libérée : un nouvel appel peut réessayer.
async function once(job: string, date: string, fn: () => Promise<Record<string, unknown>>): Promise<Outcome> {
  const claim = (await sql().query(`insert into job_runs (job, run_date) values ($1, $2::date) on conflict do nothing returning job`, [job, date])) as unknown[];
  if (!claim.length) return { status: 'déjà fait' };
  try {
    const result = await fn();
    await sql().query(`update job_runs set finished_at = now(), result = $3::jsonb where job = $1 and run_date = $2::date`, [job, date, JSON.stringify(result)]);
    return { status: 'fait' };
  } catch (e) {
    await sql().query(`delete from job_runs where job = $1 and run_date = $2::date`, [job, date]).catch(() => undefined);
    console.error(`[cron] ${job} :`, (e as Error).message);
    return { status: 'erreur', detail: (e as Error).message };
  }
}

// Appelée chaque matin par Vercel Cron (jeton CRON_SECRET vérifié par le middleware).
const run: APIRoute = async () => {
  const date = todayDakar();
  try {
    const recipients = await getRecipients();
    const email: Outcome = !mailConfigured() || !recipients.length
      ? { status: 'inactif', detail: !mailConfigured() ? 'Resend non configuré' : 'aucun destinataire' }
      : await once('brief-email', date, async () => {
          const m = briefEmail(toEmailData(await computeBrief(date)), env('PUBLIC_APP_ORIGIN') ?? '');
          await sendMail({ to: recipients, ...m });
          return { sent: recipients.length };
        });
    const backup: Outcome = !driveConfigured()
      ? { status: 'inactif', detail: 'Google Drive non configuré' }
      : await once('backup', date, async () => ({ ...(await backupToDrive(date)) }));
    return json(200, { date, email, backup });
  } catch (e) {
    console.error('[cron] daily :', (e as Error).message);
    return json(503, { error: 'unavailable' });
  }
};

export const GET = run;
export const POST = run;
