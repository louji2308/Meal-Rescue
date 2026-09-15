#!/usr/bin/env tsx
/**
 * Manual test script for OneSignal push notifications.
 *
 * Usage:
 *   npx tsx scripts/test-push.ts
 *   npx tsx scripts/test-push.ts --user <uuid> --title "Test" --body "Hello"
 *   npx tsx scripts/test-push.ts --type rescue
 *   npx tsx scripts/test-push.ts --type spoiler
 *   npx tsx scripts/test-push.ts --type pick
 *
 * Requires:
 *   - Backend server running on http://localhost:3000
 *   - Valid auth token (set AUTH_TOKEN env var)
 *   - OneSignal credentials configured in backend .env
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

// ── ANSI helpers ──────────────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

function log(label: string, msg: string): void {
  console.log(`${c.bold}${c.cyan}[${label}]${c.reset} ${msg}`);
}

function success(msg: string): void {
  console.log(`${c.bold}${c.green}✔ ${msg}${c.reset}`);
}

function fail(msg: string): void {
  console.error(`${c.bold}${c.red}✘ ${msg}${c.reset}`);
}

function info(msg: string): void {
  console.log(`${c.dim}${msg}${c.reset}`);
}

function _warn(msg: string): void {
  console.log(`${c.bold}${c.yellow}⚠ ${msg}${c.reset}`);
}

// ── CLI arg parsing ───────────────────────────────────────────────────────────

interface Args {
  user?: string;
  title?: string;
  body?: string;
  type?: 'rescue' | 'spoiler' | 'pick';
  auth?: string;
  baseUrl?: string;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { help: false };
  const rest = argv.slice(2);

  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    switch (arg) {
      case '--user':
      case '-u':
        args.user = rest[++i];
        break;
      case '--title':
      case '-t':
        args.title = rest[++i];
        break;
      case '--body':
      case '-b':
        args.body = rest[++i];
        break;
      case '--type':
        args.type = rest[++i] as Args['type'];
        break;
      case '--auth':
        args.auth = rest[++i];
        break;
      case '--base-url':
        args.baseUrl = rest[++i];
        break;
      case '--help':
      case '-h':
        args.help = true;
        break;
    }
  }

  return args;
}

// ── Predefined payloads ──────────────────────────────────────────────────────

interface TestPayload {
  title: string;
  body: string;
  buttons?: { id: string; text: string }[];
  deepLink?: string;
}

const PRESETS: Record<string, TestPayload> = {
  rescue: {
    title: 'Time to rescue your meal!',
    body: 'Your leftovers need saving tonight.',
    buttons: [
      { id: 'make_it', text: 'Make it' },
      { id: 'later', text: 'Later' },
    ],
    deepLink: 'mealrescue://rescue',
  },
  spoiler: {
    title: 'Use it soon!',
    body: 'Your milk expires tomorrow.',
    deepLink: 'mealrescue://pantry',
  },
  pick: {
    title: "Tonight's pick",
    body: 'How about pasta aglio e olio?',
    buttons: [
      { id: 'make_it', text: 'Make it' },
      { id: 'not_tonight', text: 'Not tonight' },
    ],
    deepLink: 'mealrescue://rescue?dish=pasta%20aglio%20e%20olio',
  },
};

// ── Verification instructions ────────────────────────────────────────────────

const VERIFY_INSTRUCTIONS: Record<string, string[]> = {
  rescue: [
    'Open your device and check the push notification drawer',
    'Verify the title reads: "Time to rescue your meal!"',
    'Verify the body reads: "Your leftovers need saving tonight."',
    'Tap "Make it" — app should open to the rescue flow',
    'Tap "Later" — app should open with a snooze action',
    'If deep link works, app opens mealrescue://rescue',
  ],
  spoiler: [
    'Open your device and check the push notification drawer',
    'Verify the title reads: "Use it soon!"',
    'Verify the body reads: "Your milk expires tomorrow."',
    'Tap the notification — app should open to the pantry',
    'Verify the deep link opens mealrescue://pantry',
  ],
  pick: [
    'Open your device and check the push notification drawer',
    'Verify the title reads: "Tonight\'s pick"',
    'Verify the body reads: "How about pasta aglio e olio?"',
    'Tap "Make it" — app should open the rescue flow for the dish',
    'Tap "Not tonight" — app should dismiss and suppress future picks',
    'Verify the deep link includes the dish parameter',
  ],
};

// ── Main ──────────────────────────────────────────────────────────────────────

async function sendTestPush(
  baseUrl: string,
  token: string,
  payload: { userId: string; title: string; body: string; buttons?: { id: string; text: string }[]; deepLink?: string },
): Promise<{ success: boolean; outcome?: string; error?: string }> {
  const url = `${baseUrl}/api/v1/notifications/test-push`;

  log('HTTP', `POST ${url}`);
  info(`Payload: ${JSON.stringify(payload, null, 2)}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await response.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    return { success: false, error: `Non-JSON response (${response.status}): ${bodyText}` };
  }

  if (!response.ok) {
    const errMsg = (json.message as string) ?? (json.error as string) ?? bodyText;
    return { success: false, error: `HTTP ${response.status}: ${errMsg}` };
  }

  return {
    success: (json.success as boolean) ?? response.ok,
    outcome: json.outcome as string | undefined,
    error: json.error as string | undefined,
  };
}

function printUsage(): void {
  console.log(`
${c.bold}OneSignal Push Notification Test Script${c.reset}

${c.bold}Usage:${c.reset}
  npx tsx scripts/test-push.ts [options]

${c.bold}Options:${c.reset}
  ${c.cyan}--user, -u${c.reset} <uuid>       User ID to send the push to
  ${c.cyan}--title, -t${c.reset} <string>     Notification title
  ${c.cyan}--body, -b${c.reset} <string>      Notification body
  ${c.cyan}--type${c.reset} <rescue|spoiler|pick>  Use a predefined test payload
  ${c.cyan}--auth${c.reset} <token>          Auth token (or set AUTH_TOKEN env var)
  ${c.cyan}--base-url${c.reset} <url>        Backend URL (default: http://localhost:3000)
  ${c.cyan}-h, --help${c.reset}              Show this help

${c.bold}Examples:${c.reset}
  npx tsx scripts/test-push.ts --type rescue --user <uuid>
  npx tsx scripts/test-push.ts --title "Hi" --body "Test" --user <uuid>
  AUTH_TOKEN=xxx npx tsx scripts/test-push.ts --type pick --user <uuid>

${c.bold}Environment variables:${c.reset}
  ${c.cyan}AUTH_TOKEN${c.reset}   Auth token for the API (alternative to --auth)
  ${c.cyan}BASE_URL${c.reset}     Backend server URL (default: http://localhost:3000)
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  const baseUrl = args.baseUrl ?? BASE_URL;
  const token = args.auth ?? process.env.AUTH_TOKEN;

  if (!token) {
    fail('No auth token provided.');
    info('Set AUTH_TOKEN environment variable or use --auth <token>');
    process.exit(1);
  }

  if (!args.user) {
    fail('No user ID provided.');
    info('Use --user <uuid> to specify the target user');
    process.exit(1);
  }

  // Build payload
  let payload: TestPayload;

  if (args.type) {
    const preset = PRESETS[args.type];
    if (!preset) {
      fail(`Unknown notification type: ${args.type}`);
      info(`Available types: ${Object.keys(PRESETS).join(', ')}`);
      process.exit(1);
    }
    payload = { ...preset };
    log('TYPE', `Using predefined payload for ${c.bold}${args.type}${c.reset}`);
  } else {
    if (!args.title || !args.body) {
      fail('When not using --type, you must provide --title and --body');
      info('Or use --type rescue|spoiler|pick for a predefined payload');
      process.exit(1);
    }
    payload = { title: args.title, body: args.body };
  }

  // Override title/body if explicitly provided alongside --type
  if (args.title) payload.title = args.title;
  if (args.body) payload.body = args.body;

  console.log('');
  log('CONFIG', `Server: ${c.bold}${baseUrl}${c.reset}`);
  log('CONFIG', `User:   ${c.bold}${args.user}${c.reset}`);
  log('CONFIG', `Type:   ${c.bold}${args.type ?? 'custom'}${c.reset}`);
  console.log('');

  // Send the push
  const result = await sendTestPush(baseUrl, token, {
    userId: args.user,
    title: payload.title,
    body: payload.body,
    buttons: payload.buttons,
    deepLink: payload.deepLink,
  });

  console.log('');
  console.log('─'.repeat(60));

  if (result.success) {
    success(`Push sent successfully (outcome: ${result.outcome ?? 'sent'})`);
  } else {
    fail(`Push failed: ${result.error}`);
    console.log('');
    info('Troubleshooting:');
    info('  1. Is the backend server running?');
    info('  2. Is the AUTH_TOKEN valid and not expired?');
    info('  3. Is the user ID correct?');
    info('  4. Are OneSignal credentials set in the backend .env?');
    info('     (ONESIGNAL_REST_KEY and ONESIGNAL_APP_ID)');
    process.exit(1);
  }

  // Print verification steps
  const type = args.type ?? 'custom';
  const steps = VERIFY_INSTRUCTIONS[type];

  if (steps) {
    console.log('');
    log('VERIFY', `${c.bold}What to check on your device:${c.reset}`);
    steps.forEach((step, i) => {
      console.log(`  ${c.cyan}${i + 1}.${c.reset} ${step}`);
    });
  }

  // Deep link test instructions
  if (payload.deepLink) {
    console.log('');
    log('DEEP LINK', `Test the deep link by running:`);
    info(`  adb shell am start -a android.intent.action.VIEW -d "${payload.deepLink}" com.mealrescue`);
    info(`  # or on iOS: xcrun simctl openurl booted "${payload.deepLink}"`);
  }

  console.log('');
  info(`Full payload sent:`);
  console.log(JSON.stringify({ userId: args.user, ...payload }, null, 2));
  console.log('');
}

main().catch((err) => {
  fail(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
