import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import {
  createTestApp,
  truncateAll,
  createAdminAndLogin,
  createUserAndLogin,
  flushRedis,
} from '../../test/utils/test-app.js';

describe('CategoriesController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let accessToken: string;
  let userToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await truncateAll(dataSource);
    await flushRedis(app);
    ({ accessToken } = await createAdminAndLogin(app));
    ({ accessToken: userToken } = await createUserAndLogin(app));
  });

  afterAll(async () => {
    await app.close();
  });

  const baseCategory = {
    name: 'Electrónica',
    description: 'Aparatos electrónicos',
  };

  describe('POST /categories', () => {
    it('crea una categoría válida', async () => {
      const res = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(baseCategory)
        .expect(201);

      expect(res.body).toMatchObject(baseCategory);
      expect(res.body.id).toBeDefined();
    });

    it('crea una categoría sin description (opcional)', async () => {
      const res = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Solo nombre' })
        .expect(201);

      expect(res.body.name).toBe('Solo nombre');
      expect(res.body.description).toBeNull();
    });

    it('rechaza name duplicado (409)', async () => {
      await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(baseCategory)
        .expect(201);

      await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(baseCategory)
        .expect(409);
    });

    it('rechaza payload inválido (400)', async () => {
      await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({}) // falta name
        .expect(400);

      await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...baseCategory, extraField: 'no debería pasar' })
        .expect(400);
    });
  });

  describe('GET /categories', () => {
    it('devuelve un array plano (sin paginación)', async () => {
      await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(baseCategory)
        .expect(201);
      await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Otra categoría' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/categories')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(2);
    });

    it('es público (no requiere token)', async () => {
      const res = await request(app.getHttpServer())
        .get('/categories')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /categories/:id', () => {
    it('devuelve 404 si no existe', async () => {
      await request(app.getHttpServer())
        .get('/categories/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });

    it('devuelve 400 si el UUID es inválido', async () => {
      await request(app.getHttpServer())
        .get('/categories/no-es-uuid')
        .expect(400);
    });

    it('devuelve la categoría existente', async () => {
      const category = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(baseCategory)
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/categories/${category.body.id}`)
        .expect(200);

      expect(res.body.id).toBe(category.body.id);
    });
  });

  describe('PATCH /categories/:id', () => {
    it('actualiza campos parciales', async () => {
      const category = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(baseCategory)
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/categories/${category.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ description: 'Descripción actualizada' })
        .expect(200);

      expect(res.body.description).toBe('Descripción actualizada');
      expect(res.body.name).toBe(baseCategory.name); // no tocado
    });

    it('devuelve 404 si la categoría no existe', async () => {
      await request(app.getHttpServer())
        .patch('/categories/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ description: 'x' })
        .expect(404);
    });
  });

  describe('DELETE /categories/:id', () => {
    it('elimina una categoría sin productos asociados (DELETE real)', async () => {
      const category = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(baseCategory)
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/categories/${category.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/categories/${category.body.id}`)
        .expect(404); // ya no existe, a diferencia del soft-delete de products
    });

    it('rechaza (409) eliminar una categoría con productos asociados', async () => {
      const category = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(baseCategory)
        .expect(201);

      await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          sku: 'SKU-CAT-001',
          name: 'Producto con categoría',
          price: 10,
          categoryId: category.body.id,
        })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/categories/${category.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(409);
    });

    it('devuelve 404 si la categoría no existe', async () => {
      await request(app.getHttpServer())
        .delete('/categories/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('Autorización', () => {
    it('rechaza (401) POST sin token', async () => {
      await request(app.getHttpServer())
        .post('/categories')
        .send(baseCategory)
        .expect(401);
    });

    it('rechaza (401) PATCH sin token', async () => {
      await request(app.getHttpServer())
        .patch('/categories/00000000-0000-0000-0000-000000000000')
        .send({ description: 'x' })
        .expect(401);
    });

    it('rechaza (401) DELETE sin token', async () => {
      await request(app.getHttpServer())
        .delete('/categories/00000000-0000-0000-0000-000000000000')
        .expect(401);
    });

    it('rechaza (403) POST con token de USER (no ADMIN)', async () => {
      await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${userToken}`)
        .send(baseCategory)
        .expect(403);
    });

    it('rechaza (403) PATCH con token de USER (no ADMIN)', async () => {
      await request(app.getHttpServer())
        .patch('/categories/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ description: 'x' })
        .expect(403);
    });

    it('rechaza (403) DELETE con token de USER (no ADMIN)', async () => {
      await request(app.getHttpServer())
        .delete('/categories/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });
});
