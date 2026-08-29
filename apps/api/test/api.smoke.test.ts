import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import request from 'supertest';
import { prisma } from '@nexora/database';
import { createApp } from '../src/app';

const app = createApp();

const ADMIN_EMAIL = 'admin@nexora.local';
const ADMIN_PASSWORD = 'NexoraDev123!';

async function login(token?: { value: string }) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  return res;
}

describe('Nexora API smoke tests', () => {
  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/leads');
    expect(res.status).toBe(401);
  });

  it('logs in as admin', async () => {
    const res = await login();
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe(ADMIN_EMAIL);
  });

  it('rejects bad credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  describe('authenticated endpoints', () => {
    let token: string;

    beforeAll(async () => {
      const res = await login();
      token = res.body.token;
    });

    it('GET /api/accounts returns the 7 seeded accounts', async () => {
      const res = await request(app)
        .get('/api/accounts')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(7);
    });

    it('GET /api/leads returns paginated leads', async () => {
      const res = await request(app)
        .get('/api/leads?page=1&pageSize=25')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThan(0);
      expect(res.body.total).toBeGreaterThanOrEqual(100);
      expect(res.body.items[0]).toHaveProperty('phone');
    });

    it('GET /api/leads honors search', async () => {
      const res = await request(app)
        .get('/api/leads?search=Almaty')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThan(0);
    });

    it('GET /api/campaigns returns stats', async () => {
      const res = await request(app)
        .get('/api/campaigns')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const withLeads = res.body.items.find((c: { leads: number }) => c.leads > 0);
      expect(withLeads).toBeTruthy();
    });

    it('GET /api/campaigns/:id returns series + stats', async () => {
      const list = await request(app)
        .get('/api/campaigns')
        .set('Authorization', `Bearer ${token}`);
      const real = list.body.items.find((c: { leads: number }) => c.leads > 0);
      expect(real).toBeTruthy();
      const detail = await request(app)
        .get(`/api/campaigns/${real.campaign.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(detail.status).toBe(200);
      expect(detail.body.series.length).toBe(30);
      expect(detail.body.leads).toBeGreaterThan(0);
    });

    it('GET /api/conversations returns seeded conversations', async () => {
      const res = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.total).toBeGreaterThan(0);
    });

    it('POST /api/conversations + POST /api/messages records a message', async () => {
      const accounts = await request(app)
        .get('/api/accounts')
        .set('Authorization', `Bearer ${token}`);
      const accountId = accounts.body.items[0].id;
      const leads = await request(app)
        .get('/api/leads?pageSize=1')
        .set('Authorization', `Bearer ${token}`);
      const leadId = leads.body.items[0].id;

      const created = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${token}`)
        .send({ accountId, leadId });
      expect(created.status).toBe(201);

      const message = await request(app)
        .post('/api/messages')
        .set('Authorization', `Bearer ${token}`)
        .send({
          conversationId: created.body.id,
          direction: 'OUTBOUND',
          body: 'Smoke test message',
        });
      expect(message.status).toBe(201);
      expect(message.body.message.body).toBe('Smoke test message');
    });

    it('GET /api/risk returns account risk levels', async () => {
      const res = await request(app)
        .get('/api/risk')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(7);
      expect(res.body.items[0]).toHaveProperty('risk.level');
    });

    it('GET /api/activity/latest returns events', async () => {
      const res = await request(app)
        .get('/api/activity/latest')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeGreaterThan(0);
    });

    it('GET /api/analytics returns summary shape', async () => {
      const res = await request(app)
        .get('/api/analytics')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalLeads');
      expect(res.body).toHaveProperty('funnel');
      expect(res.body.funnel[0].stage).toBe('Total leads');
    });

    it('POST /api/leads validates status enum', async () => {
      const res = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${token}`)
        .send({ companyName: 'Bad Status', status: 'BOGUS' });
      expect(res.status).toBe(400);
    });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});