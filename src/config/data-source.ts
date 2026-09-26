import 'dotenv/config';
import { DataSource } from 'typeorm';
import { env } from './env.js';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: env.db.host,
  port: env.db.port,
  username: env.db.user,
  password: env.db.password,
  database: env.db.name,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
  extra: {
    max: env.db.poolMax,
    min: env.db.poolMin,
    idleTimeoutMillis: env.db.poolIdleTimeoutMs,
    connectionTimeoutMillis: env.db.poolConnectionTimeoutMs,
  },
});