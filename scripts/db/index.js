/**
 * Embedded PostgreSQL helper — a self-contained local database for Meal
 * Rescue that needs no Docker and no system Postgres install.
 *
 *   npm run db:start    initialise (once) + start the DB as a daemon
 *   npm run db:stop     stop the DB
 *   npm run db:status   show whether the DB is reachable
 *
 * PostgreSQL is launched as an independent background daemon via its own
 * pg_ctl binary (detached from the terminal/node), so it stays up across
 * commands and survives the backend restarting.
 *
 * Connection details are read from apps/backend/.env (DATABASE_URL) so the
 * DB always matches what the backend expects; defaults mirror the documented
 * local stack (port 5433, user meal_rescue / local_password, db meal_rescue_dev).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const EmbeddedPostgres = require('embedded-postgres').default;
const { Client } = require('pg');

const ROOT = path.resolve(__dirname, '..', '..');
const BIN_DIR = path.join(
  ROOT,
  'node_modules',
  '@embedded-postgres',
  'windows-x64',
  'native',
  'bin',
);
const PG_CTL = path.join(BIN_DIR, 'pg_ctl.exe');

const DEFAULT_URL = 'postgresql://meal_rescue:local_password@localhost:5433/meal_rescue_dev';
const STATE_DIR = path.join(ROOT, '.local', 'db');
const DATA_DIR = path.join(STATE_DIR, 'data');
const RUN_FILE = path.join(STATE_DIR, 'run.json');
const LOG_FILE = path.join(STATE_DIR, 'postgres.log');
const READY_FILE = path.join(STATE_DIR, 'ready');
const PID_FILE = path.join(STATE_DIR, 'pid');

function parseDbUrl(url) {
  const m = /^postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/.exec(url || '');
  if (!m) throw new Error(`Cannot parse DATABASE_URL '${url}'`);
  return {
    user: decodeURIComponent(m[1]),
    password: decodeURIComponent(m[2]),
    host: m[3],
    port: Number(m[4]),
    database: m[5],
  };
}

function backendEnv() {
  const envPath = path.join(ROOT, 'apps', 'backend', '.env');
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}

function config() {
  const env = backendEnv();
  const url = env.DATABASE_URL || DEFAULT_URL;
  const parsed = parseDbUrl(url);
  return { ...parsed, url };
}

function wait(millis) {
  return new Promise((resolve) => setTimeout(resolve, millis));
}

async function isReachable(parsed) {
  const client = new Client({
    connectionString: `postgresql://${parsed.user}:${parsed.password}@${parsed.host}:${parsed.port}/postgres`,
    connectionTimeoutMillis: 3000,
  });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

async function ensureDatabase() {
  const { user, password, host, port, database } = config();
  const admin = new Client({
    connectionString: `postgresql://${user}:${password}@${host}:${port}/postgres`,
    connectionTimeoutMillis: 5000,
  });
  await admin.connect();
  const res = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
  if (res.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${database}"`);
  }
  await admin.end();
}

/** Create the config files / data dir once (sets user, password, auth). */
async function initialiseIfNeeded() {
  if (fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'))) return;
  const cfg = config();
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: cfg.user,
    password: cfg.password,
    port: cfg.port,
    persistent: true,
    authMethod: 'password',
  });
  await pg.initialise();
}

/**
 * Write runtime settings into the data dir's postgresql.conf so they load at
 * startup without fragile command-line quoting. The low shared_buffers shrinks
 * the fixed shared-memory segment, avoiding Windows error 487 ("could not
 * reserve shared memory region") address clashes in child backend processes.
 */
function configureConf(cfg) {
  const confPath = path.join(DATA_DIR, 'postgresql.conf');
  if (!fs.existsSync(confPath)) return;
  const body = fs.readFileSync(confPath, 'utf8');
  const extra = [
    `port = ${cfg.port}`,
    `listen_addresses = 'localhost'`,
    `shared_buffers = 4MB`,
    `dynamic_shared_memory_type = windows`,
    '',
  ].join('\n');
  if (!body.includes('shared_buffers = 4MB')) {
    fs.appendFileSync(confPath, '\n' + extra);
  }
}

async function startDb() {
  const cfg = config();
  fs.mkdirSync(STATE_DIR, { recursive: true });

  // Fresh ready/pid markers so a prior crash never fools status checks.
  try {
    fs.rmSync(READY_FILE, { force: true });
    fs.rmSync(PID_FILE, { force: true });
  } catch {}

  if (await isReachable(cfg)) {
    console.log(`[db] PostgreSQL already reachable at :${cfg.port}.`);
  } else {
    await initialiseIfNeeded();
    configureConf(cfg);
    console.log(`[db] Starting PostgreSQL daemon on port ${cfg.port}…`);
    const args = ['-D', DATA_DIR, '-l', LOG_FILE, '-w', 'start'];
    execFileSync(PG_CTL, args, { stdio: 'inherit' });
  }

  // Persist the postmaster pid so db:stop / status can find it.
  const postmasterPid = readPostmasterPid();
  fs.writeFileSync(
    RUN_FILE,
    JSON.stringify({ port: cfg.port, user: cfg.user, database: cfg.database, at: Date.now() }, null, 2),
  );
  if (postmasterPid) fs.writeFileSync(PID_FILE, String(postmasterPid));

  await ensureDatabase();

  // Wait until it actually accepts connections (recovery can take a moment).
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await isReachable(cfg)) break;
    await wait(500);
  }
  if (!(await isReachable(cfg))) {
    throw new Error('PostgreSQL did not become reachable after start. See ' + LOG_FILE);
  }
  fs.writeFileSync(READY_FILE, String(Date.now()));
  console.log(`[db] Ready → ${cfg.url}`);
  return 0;
}

function readPostmasterPid() {
  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, 'postmaster.pid'), 'utf8').split(/\r?\n/);
    const pid = Number(raw[0]);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

async function stopDb() {
  const cfg = config();
  console.log(`[db] Stopping PostgreSQL on port ${cfg.port}…`);
  try {
    execFileSync(PG_CTL, ['-D', DATA_DIR, '-m', 'fast', '-w', 'stop'], { stdio: 'inherit' });
  } catch {
    console.error('[db] No running cluster to stop (or already stopped).');
  }
  try {
    fs.rmSync(READY_FILE, { force: true });
    fs.rmSync(PID_FILE, { force: true });
  } catch {}
  console.log('[db] Stopped.');
  return 0;
}

async function statusDb() {
  const cfg = config();
  const ok = await isReachable(cfg);
  console.log(
    ok
      ? `[db] UP — PostgreSQL reachable at ${cfg.host}:${cfg.port} (db ${cfg.database})`
      : `[db] DOWN — nothing listening at ${cfg.host}:${cfg.port}`,
  );
  return ok ? 0 : 1;
}

module.exports = { startDb, stopDb, statusDb, dataDir: DATA_DIR, runFile: RUN_FILE };
