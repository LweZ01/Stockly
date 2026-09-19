// src/config/env.ts
import 'dotenv/config';
import type { StringValue } from 'ms';

interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  name: string;
}

interface JwtConfig {
  accessSecret: string;
  accessExpiresIn: StringValue;
  refreshSecret: string;
  refreshExpiresIn: StringValue;
}

interface AppConfig {
  db: DbConfig;
  jwt: JwtConfig;
}

const REQUIRED_ENVS = [
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
] as const;

function required(key: string): string {
  const value = process.env[key];
  if (value === undefined || value.trim() === '') {
    throw new Error(`[Config] Missing required environment variable: ${key}`);
  }
  return value;
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
    },
    jwt: {
      accessSecret: required('JWT_ACCESS_SECRET'),
      accessExpiresIn: (process.env.JWT_ACCESS_EXPIRES_IN ??
        '15m') as StringValue,
      refreshSecret: required('JWT_REFRESH_SECRET'),
      refreshExpiresIn: (process.env.JWT_REFRESH_EXPIRES_IN ??
        '7d') as StringValue,
    },
  };

  return rawConfig;
}

export const env = deepFreeze(loadConfig());
