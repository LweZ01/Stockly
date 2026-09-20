import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import {
  createTestApp,
  truncateAll,
  createAdminAndLogin,
} from '../../test/utils/test-app.js';
import { UsersService } from './users.service.js';
import { User } from './entities/user.entity.js';

describe('UsersController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let usersService: UsersService;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    usersService = app.get(UsersService);
  });

  beforeEach(async () => {
    await truncateAll(dataSource);
    ({ accessToken: adminToken } = await createAdminAndLogin(app));
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

  async function loginAs(email: string, password: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return res.body.accessToken as string;
  }

  describe('GET /users', () => {
    it('lista usuarios sin exponer password (solo ADMIN)', async () => {
      await createUser();
      await createUser({ email: 'otro@example.com' });

      const res = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // +1 por el admin que createAdminAndLogin ya creó
      expect(res.body.length).toBeGreaterThanOrEqual(2);
      res.body.forEach((user: Record<string, unknown>) => {
        expect(user.password).toBeUndefined();
      });
    });

    it('rechaza (401) sin token', async () => {
      await request(app.getHttpServer()).get('/users').expect(401);
    });

    it('rechaza (403) con un usuario que no es ADMIN', async () => {
      await createUser({ email: 'user@example.com', password: 'password123' });
      const userToken = await loginAs('user@example.com', 'password123');

      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });

  describe('GET /users/:id', () => {
    it('devuelve 404 si no existe (como ADMIN)', async () => {
      await request(app.getHttpServer())
        .get('/users/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('devuelve 400 si el UUID es inválido', async () => {
      await request(app.getHttpServer())
        .get('/users/no-es-uuid')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('un ADMIN puede ver a cualquier usuario', async () => {
      const user = await createUser();

      const res = await request(app.getHttpServer())
        .get(`/users/${user.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.id).toBe(user.id);
      expect(res.body.password).toBeUndefined();
    });

    it('un usuario puede verse a sí mismo', async () => {
      const user = await createUser({
        email: 'self@example.com',
        password: 'password123',
      });
      const ownToken = await loginAs('self@example.com', 'password123');

      const res = await request(app.getHttpServer())
        .get(`/users/${user.id}`)
        .set('Authorization', `Bearer ${ownToken}`)
        .expect(200);

      expect(res.body.id).toBe(user.id);
    });

    it('rechaza (403) que un usuario vea a otro usuario', async () => {
      const target = await createUser({ email: 'target@example.com' });
      await createUser({
        email: 'intruder@example.com',
        password: 'password123',
      });
      const intruderToken = await loginAs(
        'intruder@example.com',
        'password123',
      );

      await request(app.getHttpServer())
        .get(`/users/${target.id}`)
        .set('Authorization', `Bearer ${intruderToken}`)
        .expect(403);
    });

    it('rechaza (401) sin token', async () => {
      const user = await createUser();
      await request(app.getHttpServer()).get(`/users/${user.id}`).expect(401);
    });
  });

  describe('PATCH /users/:id', () => {
    it('un usuario puede actualizarse a sí mismo', async () => {
      const user = await createUser({
        email: 'self@example.com',
        password: 'password123',
      });
      const ownToken = await loginAs('self@example.com', 'password123');

      const res = await request(app.getHttpServer())
        .patch(`/users/${user.id}`)
        .set('Authorization', `Bearer ${ownToken}`)
        .send({ name: 'Nombre actualizado' })
        .expect(200);

      expect(res.body.name).toBe('Nombre actualizado');
    });

    it('un ADMIN puede actualizar a cualquier usuario', async () => {
      const user = await createUser();

      const res = await request(app.getHttpServer())
        .patch(`/users/${user.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Editado por admin' })
        .expect(200);

      expect(res.body.name).toBe('Editado por admin');
    });

    it('rechaza (403) que un usuario edite a otro usuario', async () => {
      const target = await createUser({ email: 'target@example.com' });
      await createUser({
        email: 'intruder@example.com',
        password: 'password123',
      });
      const intruderToken = await loginAs(
        'intruder@example.com',
        'password123',
      );

      await request(app.getHttpServer())
        .patch(`/users/${target.id}`)
        .set('Authorization', `Bearer ${intruderToken}`)
        .send({ name: 'hackeado' })
        .expect(403);
    });

    it('rechaza intento de cambiar password vía este endpoint (400)', async () => {
      const user = await createUser({
        email: 'self@example.com',
        password: 'password123',
      });
      const ownToken = await loginAs('self@example.com', 'password123');

      await request(app.getHttpServer())
        .patch(`/users/${user.id}`)
        .set('Authorization', `Bearer ${ownToken}`)
        .send({ password: 'nuevopassword123' })
        .expect(400);
    });

    it('devuelve 404 si el usuario no existe (como ADMIN)', async () => {
      await request(app.getHttpServer())
        .patch('/users/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'x' })
        .expect(404);
    });

    it('rechaza (401) sin token', async () => {
      const user = await createUser();
      await request(app.getHttpServer())
        .patch(`/users/${user.id}`)
        .send({ name: 'x' })
        .expect(401);
    });
  });

  describe('PATCH /users/:id/password', () => {
    it('cambia la password con credenciales correctas (204)', async () => {
      const user = await createUser({
        email: 'self@example.com',
        password: 'passwordViejo123',
      });
      const ownToken = await loginAs('self@example.com', 'passwordViejo123');

      await request(app.getHttpServer())
        .patch(`/users/${user.id}/password`)
        .set('Authorization', `Bearer ${ownToken}`)
        .send({
          currentPassword: 'passwordViejo123',
          newPassword: 'passwordNuevo123',
        })
        .expect(204);

      const updated = await usersService.findByEmail(user.email);
      const bcrypt = await import('bcrypt');
      const matches = await bcrypt.compare(
        'passwordNuevo123',
        updated!.password,
      );
      expect(matches).toBe(true);
    });

    it('rechaza (401) si currentPassword es incorrecta', async () => {
      const user = await createUser({
        email: 'self@example.com',
        password: 'passwordCorrecta123',
      });
      const ownToken = await loginAs('self@example.com', 'passwordCorrecta123');

      await request(app.getHttpServer())
        .patch(`/users/${user.id}/password`)
        .set('Authorization', `Bearer ${ownToken}`)
        .send({
          currentPassword: 'passwordIncorrecta',
          newPassword: 'passwordNuevo123',
        })
        .expect(401);
    });

    it('rechaza (400) newPassword muy corta', async () => {
      const user = await createUser({
        email: 'self@example.com',
        password: 'password123',
      });
      const ownToken = await loginAs('self@example.com', 'password123');

      await request(app.getHttpServer())
        .patch(`/users/${user.id}/password`)
        .set('Authorization', `Bearer ${ownToken}`)
        .send({ currentPassword: 'password123', newPassword: 'short' })
        .expect(400);
    });

    it('rechaza (403) que un ADMIN cambie la password de otro usuario', async () => {
      const target = await createUser({
        email: 'target@example.com',
        password: 'password123',
      });

      await request(app.getHttpServer())
        .patch(`/users/${target.id}/password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          currentPassword: 'password123',
          newPassword: 'nuevaPassword123',
        })
        .expect(403);
    });

    it('rechaza (401) sin token', async () => {
      const user = await createUser();
      await request(app.getHttpServer())
        .patch(`/users/${user.id}/password`)
        .send({ currentPassword: 'x', newPassword: 'nuevaPassword123' })
        .expect(401);
    });
  });

  describe('DELETE /users/:id', () => {
    it('un ADMIN puede hacer soft-delete de un usuario', async () => {
      const user = await createUser();

      await request(app.getHttpServer())
        .delete(`/users/${user.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      const res = await request(app.getHttpServer())
        .get(`/users/${user.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.isActive).toBe(false);
    });

    it('devuelve 404 si el usuario no existe (como ADMIN)', async () => {
      await request(app.getHttpServer())
        .delete('/users/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('rechaza (401) sin token', async () => {
      const user = await createUser();
      await request(app.getHttpServer())
        .delete(`/users/${user.id}`)
        .expect(401);
    });

    it('rechaza (403) que un usuario no-ADMIN elimine a otro', async () => {
      const target = await createUser({ email: 'target@example.com' });
      await createUser({
        email: 'intruder@example.com',
        password: 'password123',
      });
      const intruderToken = await loginAs(
        'intruder@example.com',
        'password123',
      );

      await request(app.getHttpServer())
        .delete(`/users/${target.id}`)
        .set('Authorization', `Bearer ${intruderToken}`)
        .expect(403);
    });
  });
});
