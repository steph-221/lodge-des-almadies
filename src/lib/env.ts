// Lecture d'une variable d'environnement (Astro/Vite en priorité, puis process.env).
export const env = (k: string): string | undefined => (import.meta.env as Record<string, string | undefined>)[k] ?? process.env[k];
