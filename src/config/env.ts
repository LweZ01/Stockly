// src/config/env.ts
import 'dotenv/config';
import type { StringValue } from 'ms';

interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  name: string;
  poolMax: number;
  poolMin: number;
  poolIdleTimeoutMs: number;
  poolConnectionTimeoutMs: number;
}

interface JwtConfig {
  accessSecret: string;
  accessExpiresIn: StringValue;
  refreshSecret: string;
  refreshExpiresIn: StringValue;
}

interface RedisConfig {
  url: string;
}

interface AppConfig {
  db: DbConfig;
  jwt: JwtConfig;
  redis: RedisConfig;
}

const REQUIRED_ENVS = [
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'REDIS_URL',
] as const;

function required(key: string): string {
  const value = process.env[key];
  if (value === undefined || value.trim() === '') {
    throw new Error(`[Config] Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalInt(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') {
    return defaultValue;
  }
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`[Config] ${key} must be a number, got: "${raw}"`);
  }
  return parsed;
}

function deepFreeze<T extends object>(obj: T): T {
  Object.values(obj).forEach((value) => {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value as object);
    }
  });
  return Object.freeze(obj);
}

function loadConfig(): AppConfig {
  const missing = REQUIRED_ENVS.filter((key) => {
    const value = process.env[key];
    return value === undefined || value.trim() === '';
  });

  if (missing.length > 0) {
    throw new Error(
      `[Config] Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  const port = Number(process.env.DB_PORT);
  if (Number.isNaN(port)) {
    throw new Error(
      `[Config] DB_PORT must be a number, got: "${process.env.DB_PORT}"`,
    );
  }

  const rawConfig: AppConfig = {
    db: {
      host: required('DB_HOST'),
      port,
      user: required('DB_USER'),
      password: required('DB_PASSWORD'),
      name: required('DB_NAME'),
      poolMax: optionalInt('DB_POOL_MAX', 20),
      poolMin: optionalInt('DB_POOL_MIN', 5),
      poolIdleTimeoutMs: optionalInt('DB_POOL_IDLE_TIMEOUT_MS', 30_000),
      poolConnectionTimeoutMs: optionalInt(
        'DB_POOL_CONNECTION_TIMEOUT_MS',
        5_000,
      ),
    },
    jwt: {
      accessSecret: required('JWT_ACCESS_SECRET'),
      accessExpiresIn: (process.env.JWT_ACCESS_EXPIRES_IN ??
        '15m') as StringValue,
      refreshSecret: required('JWT_REFRESH_SECRET'),
      refreshExpiresIn: (process.env.JWT_REFRESH_EXPIRES_IN ??
        '7d') as StringValue,
    },
    redis: {
      url: required('REDIS_URL'),
    },
  };

  return rawConfig;
}

export const env = deepFreeze(loadConfig());
