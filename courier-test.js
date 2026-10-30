import assert from 'node:assert/strict';
import worker from './worker.js';

const stored = [];
const orders = new Map();
const notifications = [];
const deliveries = [];
let failNext = false;
let pending = Promise.resolve();
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  assert.equal(url, 'https://api.resend.com/emails');
  deliveries.push({ ...JSON.parse(options.body), headers: options.headers });
  if (failNext) { failNext = false; return new Response(null, { status: 503 }); }
  return Response.json({ id: `message-${deliveries.length}` });
};
const db = {
  prepare(sql) {
    return {
      bind(...params) { this.params = params; return this; },
      async first() { return orders.get(this.params[0]) || null; },
      async all() {
        if (sql.includes('FROM order_notifications')) return { results: notifications.filter(row => !row.sent && (!this.params || row.order_id === this.params[0])) };
        if (sql.includes('FROM order_items')) return { results: [{ id: 'stasi-state-or-socialist-paradise', quantity: 1, unitPriceCents: 1100, titleBg: 'Щази държава или социалистически рай?', titleEn: 'Stasi State or Socialist Paradise?' }] };
        return { results: [{ id: 'stasi-state-or-socialist-paradise', priceCents: 1100, active: 1, titleBg: 'Щази държава или социалистически рай?', titleEn: 'Stasi State or Socialist Paradise?' }] };
      },
      async run() {
        const row = notifications.find(item => item.order_id === this.params[0] && item.kind === this.params[1]);
        if (row && sql.includes('SET sent_at')) row.sent = true;
      },
      sql
    };
  },
  async batch(statements) {
    stored.push(...statements);
    orders.set(statements[0].params[1], { id: statements[0].params[0], request_hash: statements[0].params[2] });
    for (const statement of statements.filter(entry => entry.sql.includes('INSERT INTO order_notifications'))) notifications.push({ order_id: statement.params[0], kind: statement.params[1], attempts: 0, language: statements[0].params[12], customer_name: statements[0].params[3], customer_email: statements[0].params[4], customer_phone: statements[0].params[5], delivery_address: statements[0].params[6], delivery_city: statements[0].params[7], delivery_postal_code: statements[0].params[8], note: statements[0].params[9], total_cents: statements[0].params[10], courier: statements[0].params[11] });
  }
};
const env = { DB: db, RESEND_API_KEY: 'test-only', ORDER_FROM_EMAIL: 'orders@example.test', ORDER_OWNER_EMAIL: 'owner@example.test', ORDER_RATE_LIMIT: { async limit() { return { success: true }; } } };
const context = { waitUntil(promise) { pending = promise; } };
const send = body => worker.fetch(new Request('https://example.test/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env, context);
const order = {
  customer: { name: 'Test Customer', email: 'test@example.com', phone: '0888123456', courier: 'econt', address: 'ул. Тест 1', city: 'София', postalCode: '1000' },
  items: [{ id: 'stasi-state-or-socialist-paradise', quantity: 1 }],
  expectedTotalCents: 1100,
  idempotencyKey: crypto.randomUUID()
};
const catalog = await worker.fetch(new Request('https://example.test/api/catalog'), env);
assert.deepEqual(await catalog.json(), { books: [{ id: order.items[0].id, priceCents: 1100, active: true }] });
const created = await send(order);
assert.equal(created.status, 201);
const { id } = await created.json();
assert.match(id, /^[0-9a-f-]{36}$/i);
assert.equal(stored[0].params[6], 'ул. Тест 1');
assert.equal(stored[0].params[11], 'econt');
await pending;
assert.equal(deliveries.length, 2);
assert.equal(deliveries[0].to[0], env.ORDER_OWNER_EMAIL);
assert.equal(deliveries[1].to[0], order.customer.email);
assert.match(deliveries[1].text, /Получихме заявката ви/);
assert.equal((await send(order)).status, 200);
assert.equal((await send({ ...order, customer: { ...order.customer, courier: 'speedy' } })).status, 409);
const speedy = await send({ ...order, idempotencyKey: crypto.randomUUID(), customer: { ...order.customer, courier: 'speedy' } });
assert.equal(speedy.status, 201);
assert.equal(stored[4].params[11], 'speedy');
await pending;
assert.equal(deliveries.length, 4);
assert.equal(notifications.filter(row => row.sent).length, 4);
const english = await send({ ...order, language: 'en', idempotencyKey: crypto.randomUUID() });
assert.equal(english.status, 201);
await pending;
assert.match(deliveries[5].text, /We received your order request/);
assert.match(deliveries[5].text, /Stasi State or Socialist Paradise/);
assert.equal(deliveries[5].headers['Idempotency-Key'], `rk-${(await english.json()).id}-customer`);
failNext = true;
const retried = await send({ ...order, idempotencyKey: crypto.randomUUID() });
assert.equal(retried.status, 201);
const retryId = (await retried.json()).id;
await pending;
assert.equal(notifications.find(row => row.order_id === retryId && row.kind === 'owner').sent, undefined);
await worker.scheduled(null, env, context);
await pending;
assert.equal(notifications.find(row => row.order_id === retryId && row.kind === 'owner').sent, true);
assert.equal(deliveries[6].headers['Idempotency-Key'], deliveries[8].headers['Idempotency-Key']);
assert.equal((await send({ ...order, idempotencyKey: crypto.randomUUID(), customer: { ...order.customer, courier: 'invalid' } })).status, 400);
assert.equal((await send({ ...order, idempotencyKey: crypto.randomUUID(), customer: { ...order.customer, courier: undefined } })).status, 400);
assert.equal((await send({ ...order, idempotencyKey: crypto.randomUUID(), customer: { ...order.customer, address: '' } })).status, 400);
assert.equal((await send({ ...order, idempotencyKey: crypto.randomUUID(), expectedTotalCents: 1 })).status, 409);
env.ORDER_RATE_LIMIT = { async limit() { return { success: false }; } };
assert.equal((await send({ ...order, idempotencyKey: crypto.randomUUID() })).status, 429);
assert.equal((await send(order)).status, 200);
env.RESEND_API_KEY = '';
assert.equal((await send({ ...order, idempotencyKey: crypto.randomUUID() })).status, 503);
globalThis.fetch = originalFetch;
console.log('Courier checkout and notification tests passed');
