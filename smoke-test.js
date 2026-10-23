import assert from 'node:assert/strict';

const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:8787';
const home = await fetch(origin);
assert.equal(home.status, 200);
assert.match(await home.text(), /Работническа култура/);
const catalogResponse = await fetch(`${origin}/api/catalog`);
assert.equal(catalogResponse.status, 200);
const { books } = await catalogResponse.json();
assert.equal(books.length, 6);

const request = {
  customer: { name: 'Test Customer', email: 'test@example.com', address: '10 Test Street', city: 'Sofia', postalCode: '1000' },
  items: [{ id: books[0].id, quantity: 2 }],
  expectedTotalCents: books[0].priceCents * 2,
  idempotencyKey: crypto.randomUUID()
};
const send = body => fetch(`${origin}/api/orders`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
});
const created = await send(request);
assert.equal(created.status, 201);
const { id } = await created.json();
assert.match(id, /^[0-9a-f-]{36}$/i);
const repeated = await send(request);
assert.equal(repeated.status, 200);
assert.equal((await repeated.json()).id, id);
const reused = await send({ ...request, customer: { ...request.customer, name: 'Different Customer' } });
assert.equal(reused.status, 409);
const changed = await send({ ...request, idempotencyKey: crypto.randomUUID(), expectedTotalCents: 1 });
assert.equal(changed.status, 409);
assert.equal((await changed.json()).error, 'PRICE_CHANGED');
const invalid = await send({ ...request, idempotencyKey: crypto.randomUUID(), items: [{ id: 'not-a-book', quantity: 1 }] });
assert.equal(invalid.status, 409);
assert.equal((await invalid.json()).error, 'UNAVAILABLE');
console.log('Storefront and D1 order smoke test passed');
