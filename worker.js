const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});

const catalogQuery = 'SELECT id, price_cents AS priceCents, active, title_bg AS titleBg, title_en AS titleEn FROM books ORDER BY sort_order';
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validText = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;

async function catalog(db) {
  const { results } = await db.prepare(catalogQuery).all();
  return results.map(row => ({ ...row, active: row.active === 1 }));
}

function publicCatalog(rows) {
  return rows.map(({ id, priceCents, active }) => ({ id, priceCents, active }));
}

function emailConfigured(env) {
  return Boolean(env.RESEND_API_KEY && emailPattern.test(env.ORDER_FROM_EMAIL || '') && emailPattern.test(env.ORDER_OWNER_EMAIL || ''));
}

function money(cents, language) {
  return new Intl.NumberFormat(language === 'en' ? 'en-IE' : 'bg-BG', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

async function sendNotification(db, env, notification) {
  const owner = notification.kind === 'owner';
  const language = owner ? 'bg' : notification.language;
  const { results: items } = await db.prepare('SELECT oi.quantity, oi.unit_price_cents AS unitPriceCents, b.title_bg AS titleBg, b.title_en AS titleEn, b.id FROM order_items oi JOIN books b ON b.id = oi.book_id WHERE oi.order_id = ? ORDER BY b.sort_order').bind(notification.order_id).all();
  const lines = items.map(item => `${item.titleBg && language === 'bg' ? item.titleBg : item.titleEn || item.titleBg || item.id} × ${item.quantity} — ${money(item.unitPriceCents * item.quantity, language)}`);
  const courier = notification.courier === 'speedy' ? 'Спиди / Speedy' : 'Еконт / Econt';
  const text = owner
    ? [`Нова заявка за поръчка: ${notification.order_id}`, '', `Клиент: ${notification.customer_name}`, `Имейл: ${notification.customer_email}`, `Телефон: ${notification.customer_phone || '—'}`, `Куриер: ${courier}`, `Адрес: ${notification.delivery_address}, ${notification.delivery_city}, ${notification.delivery_postal_code}`, `Бележка: ${notification.note || '—'}`, '', ...lines, '', `Общо за книги: ${money(notification.total_cents, 'bg')}`, 'Доставката и плащането се уточняват допълнително.'].join('\n')
    : language === 'en'
      ? [`Hello ${notification.customer_name},`, '', `We received your order request ${notification.order_id}. We will contact you to confirm availability, delivery and payment. No payment has been taken.`, '', ...lines, '', `Books subtotal: ${money(notification.total_cents, 'en')}`, `Courier: ${courier}`, `Delivery address: ${notification.delivery_address}, ${notification.delivery_city}, ${notification.delivery_postal_code}`].join('\n')
      : [`Здравейте, ${notification.customer_name},`, '', `Получихме заявката ви ${notification.order_id}. Ще се свържем с вас за потвърждение на наличност, доставка и плащане. Не сте извършили плащане.`, '', ...lines, '', `Стойност на книгите: ${money(notification.total_cents, 'bg')}`, `Куриер: ${courier}`, `Адрес за доставка: ${notification.delivery_address}, ${notification.delivery_city}, ${notification.delivery_postal_code}`].join('\n');
  const recipient = owner ? env.ORDER_OWNER_EMAIL : notification.customer_email;
  const subject = owner ? `Нова заявка ${notification.order_id}` : language === 'en' ? `Order request ${notification.order_id} — Workers’ Culture` : `Заявка ${notification.order_id} — Работническа култура`;
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': `rk-${notification.order_id}-${notification.kind}` },
      body: JSON.stringify({ from: `Работническа култура <${env.ORDER_FROM_EMAIL}>`, to: [recipient], reply_to: owner ? notification.customer_email : env.ORDER_OWNER_EMAIL, subject, text })
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    const sent = await response.json();
    if (!sent.id) throw new Error('INVALID_RESPONSE');
    await db.prepare("UPDATE order_notifications SET sent_at = datetime('now'), attempts = attempts + 1, last_error = NULL WHERE order_id = ? AND kind = ? AND sent_at IS NULL").bind(notification.order_id, notification.kind).run();
  } catch (error) {
    const reason = /^HTTP_\d+$/.test(error.message) ? error.message : 'DELIVERY_FAILED';
    const delay = Math.min(60, 2 ** Math.min(notification.attempts, 6));
    await db.prepare("UPDATE order_notifications SET attempts = attempts + 1, next_attempt_at = datetime('now', ?), last_error = ? WHERE order_id = ? AND kind = ? AND sent_at IS NULL").bind(`+${delay} minutes`, reason, notification.order_id, notification.kind).run();
    console.error('Order notification delivery failed', notification.kind, reason);
  }
}

async function sendPending(db, env, orderId) {
  if (!emailConfigured(env)) return;
  const query = `SELECT n.order_id, n.kind, n.attempts, o.language, o.customer_name, o.customer_email, o.customer_phone, o.courier, o.delivery_address, o.delivery_city, o.delivery_postal_code, o.note, o.total_cents
    FROM order_notifications n JOIN orders o ON o.id = n.order_id
    WHERE n.sent_at IS NULL AND n.next_attempt_at <= datetime('now') ${orderId ? 'AND n.order_id = ?' : ''}
    ORDER BY n.next_attempt_at LIMIT 10`;
  const statement = db.prepare(query);
  const { results } = await (orderId ? statement.bind(orderId) : statement).all();
  for (const notification of results) await sendNotification(db, env, notification);
}

async function createOrder(request, env, ctx) {
  if (!emailConfigured(env)) return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ error: 'INVALID_REQUEST' }, 400);
  if (Number(request.headers.get('content-length')) > 16384) return json({ error: 'INVALID_REQUEST' }, 413);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 16384) return json({ error: 'INVALID_REQUEST' }, 413);
  let input;
  try { input = JSON.parse(raw); } catch { return json({ error: 'INVALID_REQUEST' }, 400); }
  const customer = input?.customer;
  const items = input?.items;
  if (!customer || !Array.isArray(items) || items.length < 1 || items.length > 6 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.idempotencyKey || '') ||
      (input.language !== undefined && !['bg', 'en'].includes(input.language)) ||
      !Number.isSafeInteger(input.expectedTotalCents) || input.expectedTotalCents < 1 ||
      !validText(customer.name, 2, 100) || !validText(customer.email, 3, 254) ||
      !emailPattern.test(customer.email.trim()) ||
      !['econt', 'speedy'].includes(customer.courier) ||
      !validText(customer.address, 5, 200) || !validText(customer.city, 2, 100) || !validText(customer.postalCode, 3, 20) ||
      (customer.phone !== undefined && !validText(customer.phone, 0, 30)) ||
      (customer.note !== undefined && !validText(customer.note, 0, 500)) ||
      items.some(item => !item || typeof item.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(item.id) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) ||
      new Set(items.map(item => item.id)).size !== items.length) return json({ error: 'INVALID_REQUEST' }, 400);

  const clean = {
    name: customer.name.trim(), email: customer.email.trim(), phone: (customer.phone || '').trim(),
    address: customer.address.trim(), city: customer.city.trim(), postalCode: customer.postalCode.trim(),
    courier: customer.courier, note: (customer.note || '').trim()
  };
  const language = input.language || 'bg';
  const fingerprintInput = JSON.stringify({ customer: clean, language, items: [...items].sort((a, b) => a.id.localeCompare(b.id)), expectedTotalCents: input.expectedTotalCents });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprintInput));
  const fingerprint = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  const existing = await env.DB.prepare('SELECT id, request_hash FROM orders WHERE idempotency_key = ?').bind(input.idempotencyKey).first();
  if (existing) return existing.request_hash === fingerprint ? json({ id: existing.id }) : json({ error: 'DUPLICATE_REQUEST' }, 409);
  if (!env.ORDER_RATE_LIMIT) return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const { success } = await env.ORDER_RATE_LIMIT.limit({ key: `order:${ip}` });
  if (!success) return json({ error: 'RATE_LIMITED' }, 429);

  const rows = await catalog(env.DB);
  const byId = new Map(rows.map(row => [row.id, row]));
  if (items.some(item => !byId.get(item.id)?.active)) return json({ error: 'UNAVAILABLE', catalog: publicCatalog(rows) }, 409);
  const total = items.reduce((sum, item) => sum + byId.get(item.id).priceCents * item.quantity, 0);
  if (total !== input.expectedTotalCents) return json({ error: 'PRICE_CHANGED', catalog: publicCatalog(rows) }, 409);

  const id = crypto.randomUUID();
  const statements = [env.DB.prepare('INSERT INTO orders (id, idempotency_key, request_hash, customer_name, customer_email, customer_phone, delivery_address, delivery_city, delivery_postal_code, note, total_cents, courier, language) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, input.idempotencyKey, fingerprint, clean.name, clean.email, clean.phone, clean.address, clean.city, clean.postalCode, clean.note, total, clean.courier, language)];
  for (const item of items) statements.push(env.DB.prepare('INSERT INTO order_items (order_id, book_id, quantity, unit_price_cents) VALUES (?, ?, ?, ?)').bind(id, item.id, item.quantity, byId.get(item.id).priceCents));
  for (const kind of ['owner', 'customer']) statements.push(env.DB.prepare('INSERT INTO order_notifications (order_id, kind) VALUES (?, ?)').bind(id, kind));
  try {
    await env.DB.batch(statements);
  } catch {
    const previous = await env.DB.prepare('SELECT id, request_hash FROM orders WHERE idempotency_key = ?').bind(input.idempotencyKey).first();
    if (previous) return previous.request_hash === fingerprint ? json({ id: previous.id }) : json({ error: 'DUPLICATE_REQUEST' }, 409);
    throw new Error('Order storage failed');
  }
  if (ctx?.waitUntil) ctx.waitUntil(sendPending(env.DB, env, id).catch(() => console.error('Order notification dispatch failed')));
  return json({ id }, 201);
}

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path === '/api/catalog' || path === '/api/orders') {
      if (!env.DB) return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
      try {
        if (path === '/api/catalog' && request.method === 'GET') return json({ books: publicCatalog(await catalog(env.DB)) });
        if (path === '/api/orders' && request.method === 'POST') return await createOrder(request, env, ctx);
        return new Response(null, { status: 405, headers: { Allow: path === '/api/catalog' ? 'GET' : 'POST' } });
      } catch (error) {
        console.error('Storefront API failed', path, error?.name || 'Error');
        return json({ error: 'SERVICE_UNAVAILABLE' }, 503);
      }
    }
    if (path.startsWith('/api/')) return json({ error: 'NOT_FOUND' }, 404);
    return env.ASSETS.fetch(request);
  },
  async scheduled(_event, env, ctx) {
    if (!env.DB || !emailConfigured(env)) return;
    ctx.waitUntil(sendPending(env.DB, env).catch(() => console.error('Order notification retry failed')));
  }
};
