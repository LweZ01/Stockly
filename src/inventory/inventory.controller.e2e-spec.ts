import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, truncateAll } from '../../test/utils/test-app.js';
import { UsersService } from '../users/users.service.js';
import { ProductsService } from '../products/products.service.js';

describe('InventoryController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let usersService: UsersService;
  let productsService: ProductsService;
  let userId: string;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    usersService = app.get(UsersService);
    productsService = app.get(ProductsService);
  });

  beforeEach(async () => {
    await truncateAll(dataSource);
    const user = await usersService.create({
      email: 'almacen@example.com',
      password: 'password123',
      name: 'Encargado de Almacén',
    });
    userId = user.id;
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
        .send({ productId: product.id, type: 'entry', quantity: 50, userId })
        .expect(201);

      expect(res.body.type).toBe('entry');
      expect(res.body.quantity).toBe(50);

      const stockRes = await request(app.getHttpServer())
        .get(`/inventory/products/${product.id}/stock`)
        .expect(200);

      expect(stockRes.body.stock).toBe(50);
    });

    it('registra ENTRY seguido de EXIT y calcula el stock neto', async () => {
      const product = await createProduct();

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .send({ productId: product.id, type: 'entry', quantity: 100, userId })
        .expect(201);

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .send({ productId: product.id, type: 'exit', quantity: 30, userId })
        .expect(201);

      const stockRes = await request(app.getHttpServer())
        .get(`/inventory/products/${product.id}/stock`)
        .expect(200);

      expect(stockRes.body.stock).toBe(70);
    });

    it('rechaza (400) EXIT con stock insuficiente', async () => {
      const product = await createProduct();

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .send({ productId: product.id, type: 'entry', quantity: 10, userId })
        .expect(201);

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .send({ productId: product.id, type: 'exit', quantity: 20, userId })
        .expect(400);

      // el stock no debe haber cambiado tras el intento fallido
      const stockRes = await request(app.getHttpServer())
        .get(`/inventory/products/${product.id}/stock`)
        .expect(200);
      expect(stockRes.body.stock).toBe(10);
    });

    it('ADJUSTMENT fija el stock a un valor exacto (incluyendo 0)', async () => {
      const product = await createProduct();

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .send({ productId: product.id, type: 'entry', quantity: 40, userId })
        .expect(201);

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .send({
          productId: product.id,
          type: 'adjustment',
          quantity: 0,
          userId,
        })
        .expect(201);

      const stockRes = await request(app.getHttpServer())
        .get(`/inventory/products/${product.id}/stock`)
        .expect(200);
      expect(stockRes.body.stock).toBe(0);
    });

    it('el stock tras un ADJUSTMENT solo considera movimientos posteriores', async () => {
      const product = await createProduct();

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .send({ productId: product.id, type: 'entry', quantity: 999, userId })
        .expect(201);

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .send({
          productId: product.id,
          type: 'adjustment',
          quantity: 20,
          userId,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .send({ productId: product.id, type: 'entry', quantity: 5, userId })
        .expect(201);

      const stockRes = await request(app.getHttpServer())
        .get(`/inventory/products/${product.id}/stock`)
        .expect(200);
      expect(stockRes.body.stock).toBe(25); // 20 (ajuste) + 5 (entry posterior), ignora el entry de 999 previo
    });

    it('rechaza (400) ENTRY/EXIT con quantity 0', async () => {
      const product = await createProduct();

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .send({ productId: product.id, type: 'entry', quantity: 0, userId })
        .expect(400);

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .send({ productId: product.id, type: 'exit', quantity: 0, userId })
        .expect(400);
    });

    it('rechaza (400) quantity negativa (violación de DTO)', async () => {
      const product = await createProduct();

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .send({ productId: product.id, type: 'entry', quantity: -5, userId })
        .expect(400);
    });

    it('rechaza (404) si el producto no existe', async () => {
      await request(app.getHttpServer())
        .post('/inventory/movements')
        .send({
          productId: '00000000-0000-0000-0000-000000000000',
          type: 'entry',
          quantity: 10,
          userId,
        })
        .expect(404);
    });

    it('rechaza (400) type inválido (fuera del enum)', async () => {
      const product = await createProduct();

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .send({
          productId: product.id,
          type: 'invalid-type',
          quantity: 10,
          userId,
        })
        .expect(400);
    });

    it('guarda el reason cuando se provee', async () => {
      const product = await createProduct();

      const res = await request(app.getHttpServer())
        .post('/inventory/movements')
        .send({
          productId: product.id,
          type: 'entry',
          quantity: 10,
          reason: 'Reposición inicial',
          userId,
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
        .expect(200);

      expect(res.body).toEqual({ productId: product.id, stock: 0 });
    });

    it('devuelve 400 si el UUID del producto es inválido', async () => {
      await request(app.getHttpServer())
        .get('/inventory/products/no-es-uuid/stock')
        .expect(400);
    });
  });

  describe('GET /inventory/products/:productId/movements', () => {
    it('devuelve el historial ordenado del más reciente al más antiguo', async () => {
      const product = await createProduct();

      await request(app.getHttpServer())
        .post('/inventory/movements')
        .send({ productId: product.id, type: 'entry', quantity: 10, userId })
        .expect(201);
      await request(app.getHttpServer())
        .post('/inventory/movements')
        .send({ productId: product.id, type: 'entry', quantity: 20, userId })
        .expect(201);

      const res = await request(app.getHttpServer())
        .get(`/inventory/products/${product.id}/movements`)
        .expect(200);

      expect(res.body).toHaveLength(2);
      expect(res.body[0].quantity).toBe(20); // el más reciente primero
      expect(res.body[1].quantity).toBe(10);
    });

    it('devuelve un array vacío si el producto no tiene movimientos', async () => {
      const product = await createProduct();

      const res = await request(app.getHttpServer())
        .get(`/inventory/products/${product.id}/movements`)
        .expect(200);

      expect(res.body).toEqual([]);
    });
  });
});
