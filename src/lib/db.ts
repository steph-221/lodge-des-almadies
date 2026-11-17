import { neon } from '@neondatabase/serverless';
import { env } from './env';

export const dbConfigured = (): boolean => Boolean(env('DATABASE_URL'));

type Sql = ReturnType<typeof neon>;
let client: Sql | null = null;

// Client initialisé à la demande : les pages publiques n'appellent jamais la base.
export function sql(): Sql {
  const url = env('DATABASE_URL');
  if (!url) throw new Error('Base de données non configurée (DATABASE_URL).');
  return (client ??= neon(url));
}

export type Row = Record<string, unknown>;
