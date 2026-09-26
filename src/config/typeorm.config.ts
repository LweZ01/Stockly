import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { env } from './env.js';
import { Product } from '../products/entities/product.entity.js';
import { Category } from '../categories/entities/category.entity.js';
import { User } from '../users/entities/user.entity.js';
import { InventoryMovement } from '../inventory/entities/inventory-movement.entity.js';
import { RefreshToken } from '../auth/entities/refresh-token.entity.js';

export const typeOrmConfig = (): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: env.db.host,
  port: env.db.port,
  username: env.db.user,
  password: env.db.password,
  database: env.db.name,
  entities: [Product, Category, User, InventoryMovement, RefreshToken],
  synchronize: false,
  migrationsRun: false,
  extra: {
    max: env.db.poolMax,
    min: env.db.poolMin,
    idleTimeoutMillis: env.db.poolIdleTimeoutMs,
    connectionTimeoutMillis: env.db.poolConnectionTimeoutMs,
  },
});
