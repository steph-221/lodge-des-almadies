// Rapports : lectures agrégées de la base. Serveur uniquement. Calculs dans reports-core.ts. Aucun nom de client.
import { sql } from '../db';
import { delayStats, occupancy, topUse, type DelayRow, type DelayStat, type Occupancy, type UseRow } from './reports-core';

export type Report = { from: string; to: string; occupancy: Occupancy; requests: DelayStat[]; issues: DelayStat[]; use: UseRow[] };

const toDelay = (r: { key: string; status: string; startMin: string | number | null; doneMin: string | number | null }): DelayRow => ({
  key: r.key, status: r.status,
  startMin: r.startMin === null ? null : Number(r.startMin), doneMin: r.doneMin === null ? null : Number(r.doneMin),
});

export async function buildReport(from: string, to: string): Promise<Report> {
  const q = (text: string, p: unknown[]) => sql().query(text, p) as Promise<Record<string, unknown>[]>;
  const [rooms, stays, requests, issues, use] = await Promise.all([
    q(`select count(*)::int as n from rooms where active`, []),
    q(`select guests::int as guests, arrival::text as arrival, departure::text as departure from stays
       where status = 'booked' and arrival <= $2::date and departure > $1::date`, [from, to]),
    q(`select service as key, status, extract(epoch from (doing_at - created_at))/60 as "startMin", extract(epoch from (done_at - created_at))/60 as "doneMin"
       from requests where created_at >= $1::date and created_at < ($2::date + 1)`, [from, to]),
    q(`select priority as key, status, extract(epoch from (doing_at - created_at))/60 as "startMin", extract(epoch from (done_at - created_at))/60 as "doneMin"
       from issues where created_at >= $1::date and created_at < ($2::date + 1)`, [from, to]),
    q(`select i.id::int as "itemId", i.name, i.kind, i.unit,
         coalesce(sum(-m.qty) filter (where m.location = 'store' and m.reason in ('task','consumption','minibar')), 0)::int as used,
         coalesce(sum(-m.qty) filter (where m.reason = 'loss'), 0)::int as lost
       from items i join stock_movements m on m.item_id = i.id
       where m.at >= $1::date and m.at < ($2::date + 1)
       group by i.id`, [from, to]),
  ]);
  return {
    from, to,
    occupancy: occupancy(stays as { guests: number; arrival: string; departure: string }[], Number((rooms[0] as { n: number }).n), from, to),
    requests: delayStats((requests as never[]).map(toDelay)),
    issues: delayStats((issues as never[]).map(toDelay)),
    use: topUse(use as unknown as UseRow[]),
  };
}
