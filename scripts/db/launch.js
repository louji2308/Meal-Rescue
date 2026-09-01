#!/usr/bin/env node
'use strict';

/**
 * Launcher: starts the embedded PostgreSQL in the background (detached) so
 * the terminal is freed up and the DB keeps running across commands.
 * Waits until the DB is ready, then exits 0.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');

const ROOT = path.resolve(__dirname, '..', '..');
const STATE_DIR = path.join(ROOT, '.local', 'db');
const READY_FILE = path.join(STATE_DIR, 'ready');
const PID_FILE = path.join(STATE_DIR, 'pid');
const LOG_FILE = path.join(STATE_DIR, 'launch.log');
const DB_SCRIPT = path.join(__dirname, 'db.js');

async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true });

  // If already running (existing pid + healthy), just report and exit.
  if (fs.existsSync(PID_FILE) && fs.existsSync(READY_FILE)) {
    const existing = Number(fs.readFileSync(PID_FILE, 'utf8'));
    if (existing && isAlive(existing)) {
      console.log('[db] Already running (pid ' + existing + ').');
      return 0;
    }
  }

  const proc = spawn(process.execPath, [DB_SCRIPT, 'start'], {
    detached: true,
    stdio: 'ignore',
    cwd: ROOT,
  });
  fs.writeFileSync(PID_FILE, String(proc.pid));

  // Poll for readiness.
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await sleep(500);
    if (fs.existsSync(READY_FILE)) {
      console.log(`[db] PostgreSQL is up (pid ${proc.pid}).`);
      return 0;
    }
    // Process died -> fail fast.
    try {
      process.kill(proc.pid, 0);
    } catch {
      console.error('[db] Postgres process exited early. See ' + LOG_FILE);
      try {
        fs.rmSync(READY_FILE, { force: true });
      } catch {}
      return 1;
    }
  }
  console.error('[db] Timed out waiting for PostgreSQL to be ready.');
  return 1;
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

main().then((code) => process.exit(code));
