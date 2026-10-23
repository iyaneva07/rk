const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});

const catalogQuery = 'SELECT id, price_cents AS priceCents, active FROM books ORDER BY sort_order';

async function catalog(db) {
  const { results } = await db.prepare(catalogQuery).all();
  return results.map(row => ({ id: row.id, priceCents: row.priceCents, active: row.active === 1 }));
}

const validText = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;

async function createOrder(request, db) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ error: 'INVALID_REQUEST' }, 400);
  if (Number(request.headers.get('content-length')) > 16384) return json({ error: 'INVALID_REQUEST' }, 413);
  const raw = await request.text();
  if (raw.length > 16384) return json({ error: 'INVALID_REQUEST' }, 413);
  let input;
  try { input = JSON.parse(raw); } catch { return json({ error: 'INVALID_REQUEST' }, 400); }
  const customer = input?.customer;
  const items = input?.items;
  if (!customer || !Array.isArray(items) || items.length < 1 || items.length > 6 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.idempotencyKey || '') ||
      !Number.isSafeInteger(input.expectedTotalCents) || input.expectedTotalCents < 1 ||
      !validText(customer.name, 2, 100) || !validText(customer.email, 3, 254) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim()) ||
      !validText(customer.address, 5, 200) || !validText(customer.city, 2, 100) ||
      !validText(customer.postalCode, 3, 20) ||
      (customer.phone !== undefined && !validText(customer.phone, 0, 30)) ||
      (customer.note !== undefined && !validText(customer.note, 0, 500)) ||
      items.some(item => !item || typeof item.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(item.id) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) ||
      new Set(items.map(item => item.id)).size !== items.length) return json({ error: 'INVALID_REQUEST' }, 400);

  const clean = {
    name: customer.name.trim(), email: customer.email.trim(), phone: (customer.phone || '').trim(),
    address: customer.address.trim(), city: customer.city.trim(), postalCode: customer.postalCode.trim(), note: (customer.note || '').trim()
  };
  const fingerprintInput = JSON.stringify({ customer: clean, items: [...items].sort((a, b) => a.id.localeCompare(b.id)), expectedTotalCents: input.expectedTotalCents });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprintInput));
  const fingerprint = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const existing = await db.prepare('SELECT id, request_hash FROM orders WHERE idempotency_key = ?').bind(input.idempotencyKey).first();
  if (existing) return existing.request_hash === fingerprint ? json({ id: existing.id }) : json({ error: 'DUPLICATE_REQUEST' }, 409);

  const rows = await catalog(db);
  const byId = new Map(rows.map(row => [row.id, row]));
  if (items.some(item => !byId.get(item.id)?.active)) return json({ error: 'UNAVAILABLE', catalog: rows }, 409);
  const total = items.reduce((sum, item) => sum + byId.get(item.id).priceCents * item.quantity, 0);
  if (total !== input.expectedTotalCents) return json({ error: 'PRICE_CHANGED', catalog: rows }, 409);

  const id = crypto.randomUUID();
  const statements = [db.prepare('INSERT INTO orders (id, idempotency_key, request_hash, customer_name, customer_email, customer_phone, delivery_address, delivery_city, delivery_postal_code, note, total_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, input.idempotencyKey, fingerprint, clean.name, clean.email, clean.phone, clean.address, clean.city, clean.postalCode, clean.note, total)];
  for (const item of items) {
    statements.push(db.prepare('INSERT INTO order_items (order_id, book_id, quantity, unit_price_cents) VALUES (?, ?, ?, ?)').bind(id, item.id, item.quantity, byId.get(item.id).priceCents));
  }
  try {
    await db.batch(statements);
  } catch {
    const previous = await db.prepare('SELECT id, request_hash FROM orders WHERE idempotency_key = ?').bind(input.idempotencyKey).first();
    if (previous) return previous.request_hash === fingerprint ? json({ id: previous.id }) : json({ error: 'DUPLICATE_REQUEST' }, 409);
    throw new Error('Order storage failed');
  }
  return json({ id }, 201);
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/api/catalog' || path === '/api/orders') {
      if (!env.DB) return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
      try {
        if (path === '/api/catalog' && request.method === 'GET') return json({ books: await catalog(env.DB) });
        if (path === '/api/orders' && request.method === 'POST') return await createOrder(request, env.DB);
        return new Response(null, { status: 405, headers: { Allow: path === '/api/catalog' ? 'GET' : 'POST' } });
      } catch { return json({ error: 'SERVICE_UNAVAILABLE' }, 503); }
    }
    if (path.startsWith('/api/')) return json({ error: 'NOT_FOUND' }, 404);
    return env.ASSETS.fetch(request);
  }
};
