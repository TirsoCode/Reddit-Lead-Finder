type Level = 'debug' | 'info' | 'warn' | 'error';

const COLORS: Record<Level, string> = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};
const RESET = '\x1b[0m';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
// En el runtime de Deno no existe el objeto global `process`, así que el nivel
// se lee del entorno del propio runtime.
const MIN_LEVEL = LEVEL_ORDER[(Deno.env.get('LOG_LEVEL') as Level) ?? 'info'] ?? LEVEL_ORDER.info;

function write(level: Level, scope: string, message: string, meta?: unknown): void {
  if (LEVEL_ORDER[level] < MIN_LEVEL) return;

  const time = new Date().toISOString().slice(11, 19);
  const head = `${COLORS[level]}${time} ${level.toUpperCase().padEnd(5)}${RESET} [${scope}]`;

  if (meta === undefined) {
    console.log(`${head} ${message}`);
    return;
  }
  const detail =
    meta instanceof Error
      ? (meta.stack ?? meta.message)
      : typeof meta === 'string'
        ? meta
        : JSON.stringify(meta);
  console.log(`${head} ${message} ${detail}`);
}

export function createLogger(scope: string) {
  return {
    debug: (message: string, meta?: unknown) => write('debug', scope, message, meta),
    info: (message: string, meta?: unknown) => write('info', scope, message, meta),
    warn: (message: string, meta?: unknown) => write('warn', scope, message, meta),
    error: (message: string, meta?: unknown) => write('error', scope, message, meta),
  };
}

export type Logger = ReturnType<typeof createLogger>;
