import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { UsersService } from '../../src/users/users.service.js';
import { User } from '../../src/users/entities/user.entity.js';
import { Role } from '../../src/common/enums/role.enum.js';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  await app.init();
  return app;
}

export async function truncateAll(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    `TRUNCATE TABLE inventory_movements, refresh_tokens, products, categories, users RESTART IDENTITY CASCADE;`,
  );
}

export async function createAdminAndLogin(
  app: INestApplication,
): Promise<{ accessToken: string; user: User }> {
  const usersService = app.get(UsersService);
  const created = await usersService.create({
    email: 'admin@example.com',
    password: 'adminpassword123',
    name: 'Admin User',
  });

  const userRepository = app.get(getRepositoryToken(User));
  await userRepository.update(created.id, { role: Role.ADMIN });

  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: 'admin@example.com', password: 'adminpassword123' });

  if (res.status !== 200 || !res.body.accessToken) {
    throw new Error(
      `createAdminAndLogin falló: status=${res.status} body=${JSON.stringify(res.body)}`,
    );
  }

  return { accessToken: res.body.accessToken as string, user: created };
}

export async function createUserAndLogin(
  app: INestApplication,
): Promise<{ accessToken: string; user: User }> {
  const usersService = app.get(UsersService);
  const created = await usersService.create({
    email: 'user@example.com',
    password: 'userpassword123',
    name: 'Regular User',
  });

  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ email: 'user@example.com', password: 'userpassword123' });

  if (res.status !== 200 || !res.body.accessToken) {
    throw new Error(
      `createUserAndLogin falló: status=${res.status} body=${JSON.stringify(res.body)}`,
    );
  }

  return { accessToken: res.body.accessToken as string, user: created };
}
