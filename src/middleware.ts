import { defineMiddleware } from 'astro:middleware';
import { timingSafeEqual } from 'node:crypto';
import { COOKIE, sameOrigin } from './lib/auth';
import { env } from './lib/env';
import { json } from './lib/http';
import { isProtectedPath, routePolicy } from './lib/hotel/permissions';
import { loadSession } from './lib/hotel/session';

const isLoginPage = (p: string) => p === '/admin' || p === '/admin/';

function cronAuthorized(request: Request): boolean {
  const secret = env('CRON_SECRET');
  const got = request.headers.get('authorization') ?? '';
  if (!secret || secret.length < 16) return false;
  const want = `Bearer ${secret}`;
  return got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

// Garde centrale : tout ce qui est sous /admin/hotel, /api/hotel, /api/admin et /api/cron est fermé par défaut.
// Les pages publiques sortent immédiatement, sans lecture de session ni de base.
export const onRequest = defineMiddleware(async (ctx, next) => {
  const path = ctx.url.pathname;
  const protectedPath = isProtectedPath(path);
  if (!protectedPath && !isLoginPage(path)) return next();

  if (protectedPath && path.toLowerCase().startsWith('/api/cron')) {
    if (!cronAuthorized(ctx.request)) return json(401, { error: 'unauthorized' });
    ctx.locals.user = null;
    return next();
  }

  ctx.locals.user = await loadSession(ctx.cookies.get(COOKIE)?.value);

  if (protectedPath) {
    const method = ctx.request.method.toUpperCase();
    const write = !['GET', 'HEAD', 'OPTIONS'].includes(method);
    if (write && !sameOrigin(ctx.request)) return json(403, { error: 'forbidden' });
    if (routePolicy(path, method, ctx.locals.user?.role ?? null) === 'deny') {
      const isApi = path.toLowerCase().startsWith('/api/');
      if (isApi) return json(ctx.locals.user ? 403 : 401, { error: ctx.locals.user ? 'forbidden' : 'unauthorized' });
      return ctx.redirect(ctx.locals.user ? '/admin/hotel/' : '/admin/', 302);
    }
  }

  const res = await next();
  try {
    res.headers.set('cache-control', 'no-store');
    res.headers.set('x-robots-tag', 'noindex, nofollow');
    res.headers.set('referrer-policy', 'no-referrer');
    res.headers.set('x-frame-options', 'DENY');
    res.headers.set('x-content-type-options', 'nosniff');
  } catch {
    /* en-têtes figés (réponse de redirection) : sans conséquence */
  }
  return res;
});
