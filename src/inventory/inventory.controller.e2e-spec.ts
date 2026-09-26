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
import { ProductsService } from '../products/products.service.js';

describe('InventoryController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let productsService: ProductsService;
  let accessToken: string;
  let userToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    productsService = app.get(ProductsService);
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

  async function createProduct(
    overrides: Partial<{ sku: string; name: string; price: number }> = {},
  ) {
    return productsService.create({
      sku: overrides.sku ?? 'SKU-INV-001',
      name: overrides.name ?? 'Producto de inventario',
      price: overrides.price ?? 10,
    });
  }

  describe('POST /inventory/movements', () => {
    it('registra un ENTRY y refleja el stock', async () => {
      const product = await createProduct();

      const res = await request(app.getHttpServer())
        .post('/inventory/movements')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId: product.id, type: 'entry', quantity: 50 })
        .expect(201);

      expect(res.body.type).toBe('entry');
      expect(res.body.quantity).toBe(50);

      const stockRes = await request(app.getHttpServer())
        .get(`/inventory/products/${product.id}/stock`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(stockRes.body.stock).toBe(50);
    });

    it('registra ENTRY seguido de EXIT y calcula el stock neto', async () => {
      const product = await createProduct();

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId: product.id, type: 'entry', quantity: 100 })
        .expect(201);

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId: product.id, type: 'exit', quantity: 30 })
        .expect(201);

      const stockRes = await request(app.getHttpServer())
        .get(`/inventory/products/${product.id}/stock`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(stockRes.body.stock).toBe(70);
    });

    it('rechaza (400) EXIT con stock insuficiente', async () => {
      const product = await createProduct();

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId: product.id, type: 'entry', quantity: 10 })
        .expect(201);

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId: product.id, type: 'exit', quantity: 20 })
        .expect(400);

      const stockRes = await request(app.getHttpServer())
        .get(`/inventory/products/${product.id}/stock`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(stockRes.body.stock).toBe(10);
    });

    it('ADJUSTMENT fija el stock a un valor exacto (incluyendo 0)', async () => {
      const product = await createProduct();

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId: product.id, type: 'entry', quantity: 40 })
        .expect(201);

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId: product.id, type: 'adjustment', quantity: 0 })
        .expect(201);

      const stockRes = await request(app.getHttpServer())
        .get(`/inventory/products/${product.id}/stock`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(stockRes.body.stock).toBe(0);
    });

    it('el stock tras un ADJUSTMENT solo considera movimientos posteriores', async () => {
      const product = await createProduct();

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId: product.id, type: 'entry', quantity: 999 })
        .expect(201);

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId: product.id, type: 'adjustment', quantity: 20 })
        .expect(201);

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId: product.id, type: 'entry', quantity: 5 })
        .expect(201);

      const stockRes = await request(app.getHttpServer())
        .get(`/inventory/products/${product.id}/stock`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(stockRes.body.stock).toBe(25);
    });

    it('rechaza (400) ENTRY/EXIT con quantity 0', async () => {
      const product = await createProduct();

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId: product.id, type: 'entry', quantity: 0 })
        .expect(400);

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId: product.id, type: 'exit', quantity: 0 })
        .expect(400);
    });

    it('rechaza (400) quantity negativa (violación de DTO)', async () => {
      const product = await createProduct();

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId: product.id, type: 'entry', quantity: -5 })
        .expect(400);
    });

    it('rechaza (404) si el producto no existe', async () => {
      await request(app.getHttpServer())
        .post('/inventory/movements')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          productId: '00000000-0000-0000-0000-000000000000',
          type: 'entry',
          quantity: 10,
        })
        .expect(404);
    });

    it('rechaza (400) type inválido (fuera del enum)', async () => {
      const product = await createProduct();

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId: product.id, type: 'invalid-type', quantity: 10 })
        .expect(400);
    });

    it('guarda el reason cuando se provee', async () => {
      const product = await createProduct();

      const res = await request(app.getHttpServer())
        .post('/inventory/movements')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          productId: product.id,
          type: 'entry',
          quantity: 10,
          reason: 'Reposición inicial',
        })
        .expect(201);

      expect(res.body.reason).toBe('Reposición inicial');
    });
  });

  describe('GET /inventory/products/:productId/stock', () => {
    it('devuelve stock 0 para un producto sin movimientos', async () => {
      const product = await createProduct();

      const res = await request(app.getHttpServer())
        .get(`/inventory/products/${product.id}/stock`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toEqual({ productId: product.id, stock: 0 });
    });

    it('devuelve 400 si el UUID del producto es inválido', async () => {
      await request(app.getHttpServer())
        .get('/inventory/products/no-es-uuid/stock')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });
  });

  describe('GET /inventory/products/:productId/movements', () => {
    it('devuelve el historial paginado, ordenado del más reciente al más antiguo', async () => {
      const product = await createProduct();

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId: product.id, type: 'entry', quantity: 10 })
        .expect(201);
      await request(app.getHttpServer())
        .post('/inventory/movements')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId: product.id, type: 'entry', quantity: 20 })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/inventory/products/${product.id}/movements`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.total).toBe(2);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(10);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].quantity).toBe(20);
      expect(res.body.data[1].quantity).toBe(10);
    });

    it('respeta page y limit en la query', async () => {
      const product = await createProduct();

      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .post('/inventory/movements')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ productId: product.id, type: 'entry', quantity: 1 })
          .expect(201);
      }

      const res = await request(app.getHttpServer())
        .get(`/inventory/products/${product.id}/movements`)
        .query({ page: 2, limit: 2 })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(3);
      expect(res.body.page).toBe(2);
      expect(res.body.limit).toBe(2);
    });

    it('devuelve data vacía y total 0 si el producto no tiene movimientos', async () => {
      const product = await createProduct();

      const res = await request(app.getHttpServer())
        .get(`/inventory/products/${product.id}/movements`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toEqual({ data: [], total: 0, page: 1, limit: 10 });
    });
  });

  describe('GET /inventory/movements/recent', () => {
    it('devuelve movimientos recientes paginados, con tope de limit en 50', async () => {
      const product = await createProduct();

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ productId: product.id, type: 'entry', quantity: 10 })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get('/inventory/movements/recent')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('page');
      expect(res.body).toHaveProperty('limit');
    });

    it('rechaza (400) limit mayor a 50', async () => {
      await request(app.getHttpServer())
        .get('/inventory/movements/recent')
        .query({ limit: 100 })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });
  });

  describe('Autorización', () => {
    it('rechaza (401) POST movements sin token', async () => {
      const product = await createProduct();
      await request(app.getHttpServer())
        .post('/inventory/movements')
        .send({ productId: product.id, type: 'entry', quantity: 10 })
        .expect(401);
    });

    it('rechaza (401) GET stock sin token', async () => {
      const product = await createProduct();
      await request(app.getHttpServer())
        .get(`/inventory/products/${product.id}/stock`)
        .expect(401);
    });

    it('rechaza (403) POST movements con token de USER (no ADMIN)', async () => {
      const product = await createProduct();
      await request(app.getHttpServer())
        .post('/inventory/movements')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ productId: product.id, type: 'entry', quantity: 10 })
        .expect(403);
    });

    it('rechaza (403) GET stock con token de USER (no ADMIN)', async () => {
      const product = await createProduct();
      await request(app.getHttpServer())
        .get(`/inventory/products/${product.id}/stock`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });
});
