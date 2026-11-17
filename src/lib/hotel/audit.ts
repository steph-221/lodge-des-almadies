import { createHmac } from 'node:crypto';
import { env } from '../env';
import { sql } from '../db';

export const ipHash = (ip: string | undefined): string | null =>
  ip ? createHmac('sha256', env('STAFF_PEPPER') || env('SESSION_SECRET') || '').update(ip).digest('hex').slice(0, 24) : null;

export type AuditEntry = {
  staffId: number | null;
  actor: 'staff' | 'secours' | 'client' | 'cron';
  action: string;
  entityType?: string;
  entityId?: string | number;
  diff?: Record<string, unknown>;
  ip?: string;
};

// Journal en ajout seul. Un échec du journal ne doit jamais bloquer l'action, mais il est consigné.
export async function audit(e: AuditEntry): Promise<void> {
  try {
    const db = sql();
    await db`insert into audit_log (staff_id, actor, action, entity_type, entity_id, diff, ip_hash)
      values (${e.staffId && e.staffId > 0 ? e.staffId : null}, ${e.actor}, ${e.action}, ${e.entityType ?? null},
        ${e.entityId == null ? null : String(e.entityId)}, ${e.diff ? JSON.stringify(e.diff) : null}::jsonb, ${ipHash(e.ip)})`;
  } catch (err) {
    console.error('[audit] écriture impossible :', (err as Error).message);
  }
}
