import express, { type NextFunction, type Request, type Response } from 'express';
import { pool } from './db.js';
import { describeIntegrations, env } from './env.js';
import { HttpError } from './errors.js';
import { createLogger } from './logger.js';
import { leadsRouter } from './routes/leads.js';
import { profileRouter } from './routes/profile.js';
import { statsRouter } from './routes/stats.js';
import { aiRouter } from './routes/ai.js';
import { usingDevAuth } from './auth.js';
import { devAuthRouter } from './routes/devAuth.js';
import { startScheduler } from './services/scheduler.js';

const log = createLogger('server');

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(express.json({ limit: '256kb' }));

  // Cabeceras de seguridad básicas (sin dependencias extra).
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('select 1');
      res.json({
        ok: true,
        env: env.NODE_ENV,
        database: env.DATABASE_URL.startsWith('pglite://') ? 'pglite' : 'postgres',
        auth: usingDevAuth ? 'dev' : 'supabase',
        time: new Date().toISOString(),
      });
    } catch {
      res.status(503).json({ ok: false, error: 'La base de datos no responde' });
    }
  });

  // Modo local: registro/login propio. No se monta si se usa Supabase.
  if (usingDevAuth) {
    app.use('/api/dev', devAuthRouter);
  }

  app.use('/api/profile', profileRouter);
  app.use('/api/leads', leadsRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/ai', aiRouter);

  app.use('/api', (_req, _res, next) => {
    next(HttpError.notFound('Ese endpoint no existe'));
  });

  // --- Cliente compilado (una sola app) -----------------------------------
  if (env.isProd) {
    app.use(express.static('client/dist', { index: false, maxAge: '1h' }));
    app.get('*', (_req, res, next) => {
      res.sendFile('index.html', { root: 'client/dist' }, (error) => {
        if (error) next(error);
      });
    });
  }

  app.use((_req, _res, next) => {
    next(HttpError.notFound('Recurso no encontrado'));
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message, code: error.code, details: error.details });
      return;
    }

    log.error('Error no controlado', error);
    res.status(500).json({
      error: 'Ha ocurrido un error inesperado. Inténtalo de nuevo.',
      code: 'internal_error',
    });
  });

  return app;
}

/**
 * Las claves de ejemplo de `.env.example` dejan la app en marcha pero sin IA ni
 * Reddit. Se avisa al arrancar en vez de dejar que el primer análisis falle.
 */
function warnMissingIntegrations(): void {
  const missing = describeIntegrations().filter((item) => !item.ready);
  if (missing.length === 0) return;

  log.warn(
    `Sin configurar: ${missing.map((item) => item.name).join(', ')}. ` +
      'La app arranca, pero esas funciones fallarán hasta que pongas las claves reales en .env.',
  );
  for (const item of missing) log.warn(`  · ${item.name}: ${item.detail}`);
}

async function main(): Promise<void> {
  const app = createApp();
  const server = app.listen(env.PORT, () => {
    log.info(`API escuchando en ${env.APP_URL} (puerto ${env.PORT})`);
    warnMissingIntegrations();
    startScheduler();
  });

  const shutdown = (signal: string) => {
    log.info(`${signal} recibido, cerrando…`);
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  log.error('No se pudo arrancar el servidor', error);
  process.exit(1);
});
