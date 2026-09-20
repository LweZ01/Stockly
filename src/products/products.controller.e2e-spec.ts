import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import {
  createTestApp,
  truncateAll,
  createAdminAndLogin,
  createUserAndLogin,
} from '../../test/utils/test-app.js';

describe('ProductsController (e2e)', () => {
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
    ({ accessToken } = await createAdminAndLogin(app));
    ({ accessToken: userToken } = await createUserAndLogin(app));
  });

  afterAll(async () => {
    await app.close();
  });

  const baseProduct = {
    sku: 'SKU-001',
    name: 'Producto de prueba',
    price: 19.99,
  };

  describe('POST /products', () => {
    it('crea un producto válido', async () => {
      const res = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(baseProduct)
        .expect(201);

      expect(res.body).toMatchObject({
        sku: baseProduct.sku,
        name: baseProduct.name,
        isActive: true,
      });
      expect(res.body.price).toBe(19.99);
      expect(res.body.id).toBeDefined();
    });

    it('rechaza sku duplicado (409)', async () => {
      await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(baseProduct)
        .expect(201);

      await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(baseProduct)
        .expect(409);
    });

    it('rechaza payload inválido (400) por campos extra o faltantes', async () => {
      await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ sku: 'X' })
        .expect(400);

      await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...baseProduct, extraField: 'no debería pasar' })
        .expect(400);
    });

    it('rechaza price negativo (400)', async () => {
      await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...baseProduct, price: -5 })
        .expect(400);
    });
  });

  describe('GET /products', () => {
    it('lista solo productos activos por defecto', async () => {
      const active = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(baseProduct)
        .expect(201);

      const other = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...baseProduct, sku: 'SKU-002', name: 'Otro' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/products/${other.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      const res = await request(app.getHttpServer())
        .get('/products')
        .expect(200);

      const ids = res.body.data.map((p: { id: string }) => p.id);
      expect(ids).toContain(active.body.id);
      expect(ids).not.toContain(other.body.id);
    });

    it('es público (no requiere token)', async () => {
      const res = await request(app.getHttpServer())
        .get('/products')
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('filtra por nombre (ILIKE parcial)', async () => {
      await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...baseProduct, name: 'Teclado mecánico' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...baseProduct, sku: 'SKU-003', name: 'Mouse inalámbrico' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/products?name=teclado')
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Teclado mecánico');
    });

    it('filtra por rango de precio', async () => {
      await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...baseProduct, price: 10 })
        .expect(201);
      await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...baseProduct, sku: 'SKU-004', price: 100 })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/products?minPrice=50&maxPrice=150')
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].price).toBe('100.00');
    });

    it('pagina resultados y devuelve total/page/limit correctos', async () => {
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .post('/products')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ ...baseProduct, sku: `SKU-PAG-${i}` })
          .expect(201);
      }

      const res = await request(app.getHttpServer())
        .get('/products?page=1&limit=2')
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.total).toBe(3);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(2);

      const skus = res.body.data.map((p: { sku: string }) => p.sku);
      expect(skus).toEqual(['SKU-PAG-0', 'SKU-PAG-1']);
    });

    it('devuelve la segunda página correctamente', async () => {
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .post('/products')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ ...baseProduct, sku: `SKU-PAG-${i}` })
          .expect(201);
      }

      const res = await request(app.getHttpServer())
        .get('/products?page=2&limit=2')
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(3);
      expect(res.body.page).toBe(2);
      expect(res.body.limit).toBe(2);

      const skus = res.body.data.map((p: { sku: string }) => p.sku);
      expect(skus).toEqual(['SKU-PAG-2']);
    });
  });

  describe('GET /products/:id', () => {
    it('devuelve 404 si no existe', async () => {
      await request(app.getHttpServer())
        .get('/products/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });

    it('devuelve 400 si el UUID es inválido', async () => {
      await request(app.getHttpServer())
        .get('/products/no-es-uuid')
        .expect(400);
    });

    it('devuelve el producto con su categoría cargada', async () => {
      const category = await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Electrónica' })
        .expect(201);

      const product = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ ...baseProduct, categoryId: category.body.id })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/products/${product.body.id}`)
        .expect(200);

      expect(res.body.category.id).toBe(category.body.id);
    });
  });

  describe('PATCH /products/:id', () => {
    it('actualiza campos parciales', async () => {
      const product = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(baseProduct)
        .expect(201);

      const res = await request(app.getHttpServer())
        .patch(`/products/${product.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Nombre actualizado' })
        .expect(200);

      expect(res.body.name).toBe('Nombre actualizado');
      expect(res.body.sku).toBe(baseProduct.sku);
    });
  });

  describe('DELETE /products/:id', () => {
    it('hace soft-delete (isActive=false), no borra la fila', async () => {
      const product = await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(baseProduct)
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/products/${product.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);

      const res = await request(app.getHttpServer())
        .get(`/products/${product.body.id}`)
        .expect(200);
      expect(res.body.isActive).toBe(false);
    });
  });

  describe('Autorización', () => {
    it('rechaza (401) POST sin token', async () => {
      await request(app.getHttpServer())
        .post('/products')
        .send(baseProduct)
        .expect(401);
    });

    it('rechaza (401) PATCH sin token', async () => {
      await request(app.getHttpServer())
        .patch('/products/00000000-0000-0000-0000-000000000000')
        .send({ name: 'x' })
        .expect(401);
    });

    it('rechaza (401) DELETE sin token', async () => {
      await request(app.getHttpServer())
        .delete('/products/00000000-0000-0000-0000-000000000000')
        .expect(401);
    });

    it('rechaza (403) POST con token de USER (no ADMIN)', async () => {
      await request(app.getHttpServer())
        .post('/products')
        .set('Authorization', `Bearer ${userToken}`)
        .send(baseProduct)
        .expect(403);
    });

    it('rechaza (403) PATCH con token de USER (no ADMIN)', async () => {
      await request(app.getHttpServer())
        .patch('/products/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'x' })
        .expect(403);
    });

    it('rechaza (403) DELETE con token de USER (no ADMIN)', async () => {
      await request(app.getHttpServer())
        .delete('/products/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });
});
