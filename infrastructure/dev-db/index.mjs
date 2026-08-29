/**
 * Nexora dev database — embedded PostgreSQL for machines without Docker.
 *
 * Can be used two ways:
 *
 *  1. Standalone (manual):
 *     node index.mjs start | stop | status
 *
 *  2. Programmatically booted by the API in dev mode when DATABASE_URL
 *     points at a free localhost port and AUTO_BOOT_EMBEDDED !== 'false'.
 *     Import { bootEmbedded, dbStatus } from '@nexora/dev-db'.
 *
 * Requires a .env with DATABASE_URL (see .env.example). Clusters are
 * initialised with UTF8 encoding in <root>/infrastructure/.pg-data.
 */
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROOT = path.resolve(__dirname, '..', '..');

/**
 * On Windows the embedded Postgres data dir MUST live on an ASCII-only path:
 * initdb cannot bootstrap a UTF8 cluster when the path contains non-ASCII
 * bytes. `C:\ProgramData` is writable for standard users and ASCII-safe.
 */
const DATA_DIR =
  process.env.DEV_DB_DATA_DIR ||
  (process.platform === 'win32'
    ? 'C:\\ProgramData\\nexora\\pgdata'
    : path.join(os.homedir(), '.nexora', 'pgdata'));

const DEFAULT_URL =
  'postgresql://nexora:nexora_dev_password@localhost:5432/nexora';

export function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) {
        process.env[m[1]] = m[2].replace(/^"|"$/g, '');
      }
    }
  }
}

export function parseDatabaseUrl(url) {
  const m = url.match(/postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:/]+):(\d+)\/([^?]+)/);
  if (!m) throw new Error(`Unparseable DATABASE_URL: ${url}`);
  return {
    user: m[1],
    password: m[2],
    host: m[3],
    port: Number(m[4]),
    database: m[5].split('?')[0],
  };
}

export async function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    socket.setTimeout(1000);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(false));
  });
}

export function log(msg) {
  console.log(`[dev-db] ${msg}`);
}

/**
 * Boot the embedded PostgreSQL cluster (idempotent). Called either by the
 * CLI or lazily from the API during local development.
 * @returns {Promise<boolean>} true when a local cluster was started/booted.
 */
export async function bootEmbedded(url = process.env.DATABASE_URL) {
  const cfg = parseDatabaseUrl(url || DEFAULT_URL);

  if (await isPortOpen(cfg.port)) {
    return false;
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });

  const pgInstance = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: 'postgres',
    password: 'postgres',
    port: cfg.port,
    persistent: true,
    // NOT --encoding=UTF8: the OS returns CP1251-encoded bytes that break
    // initdb bootstrap of a UTF8 cluster on some Windows locales. --locale=C
    // is byte-clean; the target DB is then created with an explicit UTF8
    // encoding via template0 below.
    initdbFlags: ['--locale=C'],
  });

  const isInitialised = fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'));
  if (!isInitialised) {
    log(`Initialising embedded PostgreSQL in ${DATA_DIR}`);
    try {
      await pgInstance.initialise();
    } catch (err) {
      log(`Initialise note: ${err.message}`);
    }
  }
  log('Starting embedded PostgreSQL');
  await pgInstance.start();

  const admin = new pg.Client({
    host: '127.0.0.1',
    port: cfg.port,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres',
  });
  await admin.connect();
  try {
    const role = await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [cfg.user]);
    if (role.rowCount === 0) {
      await admin.query(
        `CREATE ROLE "${cfg.user}" WITH LOGIN PASSWORD '${cfg.password.replace(/'/g, "''")}'`,
      );
      log(`Role "${cfg.user}" created`);
    }
    // Prisma Migrate needs to create a shadow database for diffing.
    await admin.query(`ALTER ROLE "${cfg.user}" CREATEDB`);
    const db = await admin.query(
      'SELECT pg_encoding_to_char(encoding) AS enc FROM pg_database WHERE datname = $1',
      [cfg.database],
    );
    if (db.rowCount === 0) {
      await admin.query(
        `CREATE DATABASE "${cfg.database}" TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' OWNER "${cfg.user}"`,
      );
      log(`Database "${cfg.database}" created (UTF8)`);
    } else if (db.rows[0].enc !== 'UTF8') {
      await admin.query(`DROP DATABASE "${cfg.database}"`);
      await admin.query(
        `CREATE DATABASE "${cfg.database}" TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' OWNER "${cfg.user}"`,
      );
      log(`Database "${cfg.database}" recreated as UTF8`);
    }
  } finally {
    await admin.end();
  }

  log(`Embedded PostgreSQL running on localhost:${cfg.port} (db=${cfg.database})`);
  return true;
}

export async function dbStatus(url = process.env.DATABASE_URL) {
  const cfg = parseDatabaseUrl(url || DEFAULT_URL);
  try {
    const client = new pg.Client({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: cfg.database,
    });
    await client.connect();
    const version = await client.query('SHOW server_version');
    log(`Connected: ${cfg.host}:${cfg.port}/${cfg.database} (PostgreSQL ${version.rows[0].server_version})`);
    await client.end();
    return true;
  } catch (err) {
    log(`Not connected — ${err.message}`);
    return false;
  }
}

// ---------- CLI entry point (only when run directly) ----------
const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isCli) {
  loadEnv();
  const command = process.argv[2] || 'start';
  const run = async () => {
    if (command === 'start') {
      const booted = await bootEmbedded();
      if (!booted) {
        log('Port already open — local PostgreSQL assumed running. Done.');
        return;
      }
      log('Keep this process alive while developing, or just run `pnpm dev` (starts it automatically via the API).');
      const shutdown = async () => process.exit(0);
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
      setInterval(() => {}, 1 << 30);
    } else if (command === 'stop') {
      const url = process.env.DATABASE_URL || DEFAULT_URL;
      const cfg = parseDatabaseUrl(url);
      if (!(await isPortOpen(cfg.port))) {
        log('No local PostgreSQL detected on port ' + cfg.port);
        process.exit(0);
      }
      const admin = new pg.Client({
        host: '127.0.0.1',
        port: cfg.port,
        user: cfg.user,
        password: cfg.password,
        database: cfg.database,
      });
      await admin.connect();
      await admin.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
        [cfg.database],
      );
      await admin.end();
      log('Local PostgreSQL sessions terminated. Stop the owner process to release port 5432.');
      process.exit(0);
    } else if (command === 'status') {
      const ok = await dbStatus(process.env.DATABASE_URL);
      process.exit(ok ? 0 : 1);
    } else {
      console.log('Unknown command: ' + command);
      process.exit(1);
    }
  };
  run().catch((err) => {
    console.error('[dev-db] Fatal:', err);
    process.exit(1);
  });
}