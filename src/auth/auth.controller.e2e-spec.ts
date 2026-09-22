import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, truncateAll } from '../../test/utils/test-app.js';
import { User } from '../users/entities/user.entity.js';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await truncateAll(dataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  const credentials = {
    email: 'jr@example.com',
    password: 'password123',
    name: 'Jr Dev',
  };

  function extractRefreshCookie(res: request.Response): string {
    const setCookie = res.headers['set-cookie'];
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    const refreshCookie = cookies.find((c: string) =>
      c?.startsWith('refreshToken='),
    );
    if (!refreshCookie)
      throw new Error('No se encontró la cookie refreshToken en la respuesta');
    return refreshCookie.split(';')[0]; // "refreshToken=valor"
  }

  describe('POST /auth/register', () => {
    it('registra un usuario y no expone el password', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send(credentials)
        .expect(201);

      expect(res.body.email).toBe(credentials.email);
      expect(res.body.password).toBeUndefined();
      expect(res.body.id).toBeDefined();
    });

    it('rechaza email duplicado (409)', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(credentials)
        .expect(201);

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(credentials)
        .expect(409);
    });

    it('rechaza password menor a 8 caracteres (400)', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({ ...credentials, password: 'short' })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(credentials)
        .expect(201);
    });

    it('loguea con credenciales correctas y setea la cookie httpOnly', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: credentials.email, password: credentials.password })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.email).toBe(credentials.email);
      expect(res.body.user.password).toBeUndefined();

      const setCookie = res.headers['set-cookie'];
      const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
      const refreshCookie = cookies.find((c: string) =>
        c?.startsWith('refreshToken='),
      );
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toMatch(/HttpOnly/i);
    });

    it('rechaza credenciales incorrectas (401)', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: credentials.email, password: 'wrongpassword' })
        .expect(401);
    });

    it('rechaza email inexistente (401, mensaje genérico)', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'noexiste@example.com', password: credentials.password })
        .expect(401);
    });
  });

  describe('POST /auth/refresh', () => {
    it('rota el refresh token y emite un nuevo access token', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(credentials)
        .expect(201);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: credentials.email, password: credentials.password })
        .expect(200);

      const oldCookie = extractRefreshCookie(loginRes);

      const refreshRes = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', oldCookie)
        .expect(200);

      expect(refreshRes.body.accessToken).toBeDefined();

      const newCookie = extractRefreshCookie(refreshRes);
      expect(newCookie).not.toBe(oldCookie); // rotación: el token cambió
    });

    it('rechaza (401) si no hay cookie', async () => {
      await request(app.getHttpServer()).post('/auth/refresh').expect(401);
    });

    it('detecta reuso de un token ya rotado y revoca TODOS los tokens del usuario', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(credentials)
        .expect(201);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: credentials.email, password: credentials.password })
        .expect(200);

      const originalCookie = extractRefreshCookie(loginRes);

      // Primer refresh: rota el token, el original queda revocado
      const firstRefresh = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', originalCookie)
        .expect(200);
      const rotatedCookie = extractRefreshCookie(firstRefresh);

      // Reusar el token ORIGINAL (ya revocado) → debe rechazar y disparar la detección de reuso
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', originalCookie)
        .expect(401);

      // El token que SÍ era válido (el rotado) también debería quedar revocado ahora
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', rotatedCookie)
        .expect(401);
    });
  });

  describe('GET /auth/me', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(credentials)
        .expect(201);
    });

    it('devuelve el usuario actual sin password (200)', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: credentials.email, password: credentials.password })
        .expect(200);

      const { accessToken } = loginRes.body;

      const meRes = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(meRes.body.email).toBe(credentials.email);
      expect(meRes.body.name).toBe(credentials.name);
      expect(meRes.body.id).toBeDefined();
      expect(meRes.body.password).toBeUndefined();
    });

    it('devuelve 401 sin token', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('devuelve 401 con token malformado', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);
    });

    it('devuelve 401 si el usuario fue desactivado después de emitido el token', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: credentials.email, password: credentials.password })
        .expect(200);

      const { accessToken } = loginRes.body;

      await dataSource
        .getRepository(User)
        .update({ email: credentials.email }, { isActive: false });

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('revoca el refresh token y responde 204', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(credentials)
        .expect(201);

      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: credentials.email, password: credentials.password })
        .expect(200);

      const cookie = extractRefreshCookie(loginRes);

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Cookie', cookie)
        .expect(204);

      // el token ya no debería servir para refrescar
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', cookie)
        .expect(401);
    });

    it('responde 204 incluso sin cookie (logout idempotente)', async () => {
      await request(app.getHttpServer()).post('/auth/logout').expect(204);
    });
  });
});
