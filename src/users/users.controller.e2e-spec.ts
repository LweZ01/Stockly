import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, truncateAll } from '../../test/utils/test-app.js';
import { UsersService } from './users.service.js';
import { User } from './entities/user.entity.js';

describe('UsersController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let usersService: UsersService;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    usersService = app.get(UsersService);
  });

  beforeEach(async () => {
    await truncateAll(dataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  async function createUser(
    overrides: Partial<{ email: string; password: string; name: string }> = {},
  ): Promise<User> {
    return usersService.create({
      email: overrides.email ?? 'jr@example.com',
      password: overrides.password ?? 'password123',
      name: overrides.name ?? 'Jr Dev',
    });
  }

  describe('GET /users', () => {
    it('lista usuarios sin exponer password', async () => {
      await createUser();
      await createUser({ email: 'otro@example.com' });

      const res = await request(app.getHttpServer()).get('/users').expect(200);

      expect(res.body).toHaveLength(2);
      res.body.forEach((user: Record<string, unknown>) => {
        expect(user.password).toBeUndefined();
      });
    });
  });

  describe('GET /users/:id', () => {
    it('devuelve 404 si no existe', async () => {
      await request(app.getHttpServer())
        .get('/users/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });

    it('devuelve 400 si el UUID es inválido', async () => {
      await request(app.getHttpServer()).get('/users/no-es-uuid').expect(400);
    });

    it('devuelve el usuario sin password', async () => {
      const user = await createUser();

      const res = await request(app.getHttpServer())
        .get(`/users/${user.id}`)
        .expect(200);

      expect(res.body.id).toBe(user.id);
      expect(res.body.email).toBe(user.email);
      expect(res.body.password).toBeUndefined();
    });
  });

  describe('PATCH /users/:id', () => {
    it('actualiza campos permitidos (name)', async () => {
      const user = await createUser();

      const res = await request(app.getHttpServer())
        .patch(`/users/${user.id}`)
        .send({ name: 'Nombre actualizado' })
        .expect(200);

      expect(res.body.name).toBe('Nombre actualizado');
    });

    it('rechaza intento de cambiar password vía este endpoint (400)', async () => {
      const user = await createUser();

      // UpdateUserDto = PartialType(OmitType(CreateUserDto, ['password']))
      // con ValidationPipe whitelist+forbidNonWhitelisted, "password" es un campo no reconocido
      await request(app.getHttpServer())
        .patch(`/users/${user.id}`)
        .send({ password: 'nuevopassword123' })
        .expect(400);
    });

    it('devuelve 404 si el usuario no existe', async () => {
      await request(app.getHttpServer())
        .patch('/users/00000000-0000-0000-0000-000000000000')
        .send({ name: 'x' })
        .expect(404);
    });
  });

  describe('PATCH /users/:id/password', () => {
    it('cambia la password con credenciales correctas (204)', async () => {
      const user = await createUser({ password: 'passwordViejo123' });

      await request(app.getHttpServer())
        .patch(`/users/${user.id}/password`)
        .send({
          currentPassword: 'passwordViejo123',
          newPassword: 'passwordNuevo123',
        })
        .expect(204);

      // verificamos indirectamente: findByEmail debe traer el nuevo hash funcionando
      const updated = await usersService.findByEmail(user.email);
      const bcrypt = await import('bcrypt');
      const matches = await bcrypt.compare(
        'passwordNuevo123',
        updated!.password,
      );
      expect(matches).toBe(true);
    });

    it('rechaza (401) si currentPassword es incorrecta', async () => {
      const user = await createUser({ password: 'passwordCorrecta123' });

      await request(app.getHttpServer())
        .patch(`/users/${user.id}/password`)
        .send({
          currentPassword: 'passwordIncorrecta',
          newPassword: 'passwordNuevo123',
        })
        .expect(401);
    });

    it('rechaza (400) newPassword muy corta', async () => {
      const user = await createUser();

      await request(app.getHttpServer())
        .patch(`/users/${user.id}/password`)
        .send({ currentPassword: 'password123', newPassword: 'short' })
        .expect(400);
    });
  });

  describe('DELETE /users/:id', () => {
    it('hace soft-delete (isActive=false), no borra la fila', async () => {
      const user = await createUser();

      await request(app.getHttpServer())
        .delete(`/users/${user.id}`)
        .expect(204);

      const res = await request(app.getHttpServer())
        .get(`/users/${user.id}`)
        .expect(200);

      expect(res.body.isActive).toBe(false);
    });

    it('devuelve 404 si el usuario no existe', async () => {
      await request(app.getHttpServer())
        .delete('/users/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });
});
