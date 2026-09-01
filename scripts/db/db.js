#!/usr/bin/env node
'use strict';

const { startDb, stopDb, statusDb } = require('./index');

const cmd = process.argv[2] || 'start';

async function main() {
  switch (cmd) {
    case 'start':
      process.exit(await startDb());
      return;
    case 'stop':
      process.exit(await stopDb());
      return;
    case 'status':
      process.exit(await statusDb());
      return;
    default:
      console.error(`[db] Unknown command '${cmd}'. Use start | stop | status.`);
      process.exit(2);
  }
}

main().catch((err) => {
  console.error('[db] Error:', err.message);
  process.exit(1);
});
