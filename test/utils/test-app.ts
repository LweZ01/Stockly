import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module.js';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  await app.init();
  return app;
}

export async function truncateAll(dataSource: DataSource): Promise<void> {
  // orden no importa gracias a CASCADE, pero se listan de "hijo" a "padre" por claridad
  await dataSource.query(
    `TRUNCATE TABLE inventory_movements, products, categories, users RESTART IDENTITY CASCADE;`,
  );
}
