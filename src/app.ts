import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookie from '@fastify/cookie';
import formBody from '@fastify/formbody';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import fastifyView from '@fastify/view';
import { sql } from 'drizzle-orm';
import { Eta } from 'eta';
import Fastify from 'fastify';
import { env, isProduction } from './config.ts';
import { db, pool } from './db/client.ts';
import { errorHandler, notFoundHandler } from './errors.ts';
import { authRoutes } from './routes/auth.ts';
import { itemRoutes } from './routes/items.ts';
import { offerRoutes } from './routes/offers.ts';
import { requireAuth, verifySameOrigin } from './security/hooks.ts';
import { buildTrustProxy, rateLimitKey } from './security/trustProxy.ts';
import { viewHelpers } from './viewHelpers.ts';

// views/ e public/ ficam na raiz do projeto: o caminho vale para src/ (dev) e para dist/
const ROOT_DIR = path.join(import.meta.dirname, '..');
const VIEWS_DIR = path.join(ROOT_DIR, 'views');
const HTMX_DIR = path.dirname(fileURLToPath(import.meta.resolve('htmx.org/dist/htmx.min.js')));

export async function buildApp() {
  const app = Fastify({
    logger: { level: env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug') },
    trustProxy: buildTrustProxy(env.TRUST_PROXY),
    bodyLimit: 100 * 1024,
  });

  await app.register(helmet, {
    contentSecurityPolicy: { directives: { upgradeInsecureRequests: isProduction ? [] : null } },
  });

  await app.register(rateLimit, { max: 300, timeWindow: '1 minute', keyGenerator: rateLimitKey });
  await app.register(cookie, { secret: env.SESSION_SECRET });
  await app.register(formBody);

  await app.register(fastifyView, {
    engine: { eta: new Eta({ views: VIEWS_DIR, autoEscape: true, cache: isProduction }) },
    templates: VIEWS_DIR,
    production: isProduction,
    defaultContext: viewHelpers,
  });

  await app.register(fastifyStatic, { root: path.join(ROOT_DIR, 'public'), prefix: '/static/' });

  await app.register(fastifyStatic, {
    root: HTMX_DIR,
    prefix: '/vendor/htmx/',
    decorateReply: false,
    allowedPath: (pathName) => pathName === '/htmx.min.js',
  });

  app.addHook('onRequest', verifySameOrigin);
  app.addHook('onClose', () => pool.end());
  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler(notFoundHandler);

  app.get('/health', async () => {
    await db.execute(sql`SELECT 1`);

    return { status: 'ok' };
  });

  await app.register(authRoutes);

  await app.register(async (privateApp) => {
    privateApp.addHook('onRequest', requireAuth);
    await privateApp.register(itemRoutes);
    await privateApp.register(offerRoutes);
  });

  return app;
}
