import { z } from 'zod';

/**
 * Central environment configuration.
 *
 * Every process.env access in the app goes through this module so that:
 * 1. Config errors surface at boot, not at request time
 * 2. Types are inferred from the schema, not hand-maintained
 * 3. Production has stricter requirements than local dev
 */

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Database
  DATABASE_URL: z
    .string()
    .default('postgresql://meal_rescue:local_password@localhost:5432/meal_rescue_dev'),
  // Test-only override consumed by src/database/index.ts when NODE_ENV=test
  TEST_DATABASE_URL: z.string().optional(),
  DB_POOL_MAX: z.coerce.number().int().positive().default(20),
  DB_POOL_MIN: z.coerce.number().int().nonnegative().default(2),

  // Redis (optional - graceful degradation per architecture doc)
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_DISABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  // Auth
  JWT_SECRET: z.string().min(16).default('dev-only-secret-change-me-in-prod!'),
  JWT_EXPIRES_IN: z.string().default('24h'),

  // Firebase Admin SDK (optional until Firebase project is provisioned)
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),

  // AI services (Phase 2)
  // Without OPENAI_API_KEY the pipeline runs on the deterministic heuristic
  // client - same contracts, no network calls. Production should always
  // set a key; dev/test/CI intentionally work without one.
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  LLM_MODEL_VERSION: z.string().optional(),
  OPENAI_VISION_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_TEXT_MODEL: z.string().default('gpt-4o-mini'),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  // One retry on malformed LLM JSON per the system-prompts doc
  AI_MAX_RETRIES: z.coerce.number().int().min(0).max(3).default(1),

  // Storage (Phase 2+)
  GCS_BUCKET_NAME: z.string().optional(),

  // CORS
  CORS_ORIGIN: z.string().default('*'),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),

  // Monitoring
  SENTRY_DSN: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const env = parsed.data;

  if (env.NODE_ENV === 'production') {
    const productionErrors: string[] = [];
    if (env.JWT_SECRET === 'dev-only-secret-change-me-in-prod!') {
      productionErrors.push('  JWT_SECRET must be set to a strong value in production');
    }
    if (!process.env.DATABASE_URL) {
      productionErrors.push('  DATABASE_URL must be explicitly set in production');
    }
    if (productionErrors.length > 0) {
      throw new Error(
        `Refusing to start in production with unsafe configuration:\n${productionErrors.join('\n')}`,
      );
    }
  }

  return env;
}

export const env = loadEnv();
