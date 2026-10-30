import assert from 'node:assert/strict';

const origin = process.argv[2] || process.env.TEST_ORIGIN || 'http://127.0.0.1:8787';
const home = await fetch(origin);
assert.equal(home.status, 200);
assert.match(await home.text(), /Работническа култура/);
const catalogResponse = await fetch(`${origin}/api/catalog`);
assert.equal(catalogResponse.status, 200);
const { books } = await catalogResponse.json();
const currentBook = books.find(book => book.id === 'stasi-state-or-socialist-paradise');
assert.equal(currentBook?.active, true);
assert.equal(currentBook?.priceCents, 1100);
const rejected = await fetch(`${origin}/api/orders`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{'
});
assert.ok([400, 503].includes(rejected.status));
console.log('Storefront and D1 read-only smoke test passed');
