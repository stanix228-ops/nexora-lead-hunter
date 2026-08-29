import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional().default(''),
  API_CORS_ORIGIN: z.string().default('http://localhost:3000'),
  JWT_SECRET: z.string().min(16).default('development-insecure-secret-change-me'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  SESSION_TTL_SECONDS: z.coerce.number().default(604800),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(120),
  TRUST_PROXY: z.coerce.number().default(0),
  AUTO_BOOT_EMBEDDED: z.enum(['true', 'false']).default('true'),
});

function loadEnvFile() {
  // Prisma / tsx have already loaded .env at the repo root in most cases,
  // but make it explicit so `node dist` also works from any cwd.
  const { config } = require('dotenv');
  const path = require('node:path');
  config({ path: path.resolve(process.cwd(), '.env') });
  config({ path: path.resolve(process.cwd(), '../.env') });
  config({ path: path.resolve(process.cwd(), '../../.env') });
  config({ path: path.resolve(__dirname, '../../../.env') });
  config({ path: path.resolve(__dirname, '../../../../.env') });
}

loadEnvFile();

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment:\n${parsed.error.flatten().fieldErrors}`);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';

export const allowedOrigins = env.API_CORS_ORIGIN.split(',')
  .map((o) => o.trim())
  .filter(Boolean);