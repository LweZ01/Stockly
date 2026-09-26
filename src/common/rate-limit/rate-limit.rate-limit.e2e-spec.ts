import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import {
  createTestApp,
  truncateAll,
  flushRedis,
} from '../../../test/utils/test-app.js';

describe('Rate limiting (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await truncateAll(dataSource);
    await flushRedis(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const credentials = {
    email: 'ratelimit@example.com',
    password: 'password123',
    name: 'Rate Limit Test',
  };

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(credentials)
        .expect(201);
    });

    it('permite hasta el límite configurado y rechaza (429) al superarlo', async () => {
      const loginAttempt = () =>
        request(app.getHttpServer())
          .post('/auth/login')
          .send({ email: credentials.email, password: 'wrongpassword' });

      for (let i = 0; i < 5; i++) {
        const res = await loginAttempt();
        expect(res.status).toBe(401);
      }

      const blockedRes = await loginAttempt();
      expect(blockedRes.status).toBe(429);
    });

    it('no bloquea logins exitosos por debajo del límite', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: credentials.email, password: credentials.password })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
    });
  });
});
