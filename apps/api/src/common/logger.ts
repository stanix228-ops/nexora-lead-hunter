type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function write(level: Level, message: string, meta?: Record<string, unknown>) {
  const threshold = process.env.LOG_LEVEL ?? 'info';
  if (LEVELS[level] < LEVELS[threshold as Level]) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...meta,
  };
  if (level === 'error') {
    process.stderr.write(JSON.stringify(line) + '\n');
  } else {
    process.stdout.write(JSON.stringify(line) + '\n');
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => write('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => write('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => write('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write('error', msg, meta),
  http: (method: string, url: string, status: number, ms: number) =>
    write('info', `${method} ${url} ${status} ${ms}ms`, { http: { method, url, status, ms } }),
};

// Pino-compatible surface so third-party libs (Baileys) can call `child()`.
function makeLogger(bindings: Record<string, unknown>) {
  return {
    trace: (msg: string, meta?: Record<string, unknown>) => write('debug', msg, { ...bindings, ...meta }),
    debug: (msg: string, meta?: Record<string, unknown>) => write('debug', msg, { ...bindings, ...meta }),
    info: (msg: string, meta?: Record<string, unknown>) => write('info', msg, { ...bindings, ...meta }),
    warn: (msg: string, meta?: Record<string, unknown>) => write('warn', msg, { ...bindings, ...meta }),
    error: (msg: string, meta?: Record<string, unknown>) => write('error', msg, { ...bindings, ...meta }),
    fatal: (msg: string, meta?: Record<string, unknown>) => write('error', msg, { ...bindings, ...meta }),
    silent: () => {},
    child: (b: Record<string, unknown>) => makeLogger({ ...bindings, ...b }),
    level: 'info',
  };
}

export const pinoLogger = makeLogger({});