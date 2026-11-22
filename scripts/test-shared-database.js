import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { PgDialect } from 'drizzle-orm/pg-core';
import { createWebsiteStore, localJsonStore } from '../netlify/functions/db.js';

// Simulate shared durable storage for independent clients, including CAS races.
const dialect = new PgDialect();
let row;
let imports = 0;
const fakeDb = {
  select: () => ({ from: () => ({ where: async () => row ? [structuredClone(row)] : [] }) }),
  insert: () => ({ values: value => ({ onConflictDoNothing: async () => { row ||= structuredClone(value); } }) }),
  update: () => ({ set: value => ({ where: condition => ({ returning: async () => {
    const revision = dialect.sqlToQuery(condition).params.at(-1);
    if (row.revision !== revision) return [];
    row = { ...row, ...structuredClone(value) };
    return [{ id: row.id }];
  } }) }) }),
};
const seed = () => {
  imports++;
  return { _id: 'main', version: 10, products: [{ _id: 'p1', slug: 'test', name: 'Original', salePrice: 20, stock: 3 }], categories: [], orders: [{ orderId: 'existing' }], admins: [], metaEventLogs: [], hero: { title: 'Original' }, metaSettings: {} };
};
const admin = createWebsiteStore(() => fakeDb, seed);
const storefront = createWebsiteStore(() => fakeDb, seed);
assert.equal((await storefront.getWebsiteData()).version, 10);
await admin.updateProduct('p1', { name: 'Updated' });
assert.equal((await storefront.getProductBySlug('test')).name, 'Updated');
assert.equal(imports, 1, 'Seed must never overwrite persisted updates');
await Promise.all([
  admin.addCategory({ _id: 'c1', name: 'First' }),
  storefront.addCategory({ _id: 'c2', name: 'Second' }),
]);
assert.equal((await admin.getCategories()).length, 2, 'Concurrent writes must both survive');
const stale = await admin.getWebsiteData();
await storefront.updateProduct('p1', { name: 'Newer' });
await assert.rejects(admin.updateWebsiteData({ hero: { title: 'Stale' } }, stale.version), err => err.conflict === true);
await admin.updateWebsiteData({ hero: { title: 'Published' }, orders: [], admins: [], metaEventLogs: [] });
assert.equal((await storefront.getOrders()).length, 1, 'CMS updates must preserve private collections');
await admin.updateWebsiteConfig({ hero: { title: 'Config published' } });
assert.equal((await storefront.getWebsiteData()).hero.title, 'Config published');
const order = { items: [{ productId: 'p1', unitPrice: 20, quantity: 2 }], orderStatus: 'Pending' };
const attempts = await Promise.allSettled([admin.addOrder(order, true), storefront.addOrder(order, true)]);
assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 1, 'Only available stock can be sold');
assert.equal((await admin.getProductBySlug('p1')).stock, 1);
assert.equal((await admin.getOrders()).length, 2, 'Rejected order must not be persisted');
const before = await admin.getWebsiteData();
await assert.rejects(admin.addOrder({ items: [{ productId: 'p1', unitPrice: 20, quantity: 1 }, { productId: 'missing', unitPrice: 20, quantity: 1 }] }, true));
assert.deepEqual(await admin.getWebsiteData(), before, 'Invalid order must not decrement any stock');
await admin.addMetaLog({ eventId: 'e1', status: 'pending' });
await storefront.updateMetaLog('e1', { status: 'success' });
assert.equal((await admin.getMetaLogById('e1')).status, 'success');

// Exercise the deployed Express/serverless route adapter using the same store.
Object.assign(localJsonStore, storefront);
process.env.JWT_SECRET = randomUUID();
const { handler } = await import('../netlify/functions/api.js');
const event = { httpMethod: 'GET', path: '/api/website-data', headers: {}, body: null, isBase64Encoded: false, requestContext: {}, queryStringParameters: null };
const response = await handler(event, {});
assert.equal(response.statusCode, 200);
const payload = JSON.parse(response.body).data;
assert.equal(payload.products[0].name, 'Newer');
for (const key of ['orders', 'admins', 'metaEventLogs']) assert.equal(Object.hasOwn(payload, key), false);
assert.equal(response.headers['cache-control'], 'no-store');
const denied = await handler({ ...event, path: '/api/admin/website-data' }, {});
assert.equal(denied.statusCode, 401);
const token = jwt.sign({ username: 'test-admin', role: 'superadmin' }, process.env.JWT_SECRET);
const edited = await handler({ ...event, httpMethod: 'PUT', path: '/api/admin/products/p1',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'Published through admin' }),
}, {});
assert.equal(edited.statusCode, 200);
const published = await handler(event, {});
assert.equal(JSON.parse(published.body).data.products[0].name, 'Published through admin');
const adminResponse = await handler({ ...event, path: '/api/admin/website-data', headers: { authorization: `Bearer ${token}` } }, {});
assert.equal(adminResponse.statusCode, 200);
assert.equal(Object.hasOwn(JSON.parse(adminResponse.body).data, 'admins'), false);
const savedRead = localJsonStore.getWebsiteData;
localJsonStore.getWebsiteData = async () => { throw new Error('Simulated unavailable database'); };
const savedError = console.error;
console.error = () => {};
try {
  const outage = await handler(event, {});
  assert.equal(outage.statusCode, 503);
  assert.equal(JSON.parse(outage.body).success, false);
} finally { console.error = savedError; localJsonStore.getWebsiteData = savedRead; }
console.log('Shared reads, persistence, concurrent edits, version conflicts, atomic checkout, logs, public filtering, auth protection, and outage handling passed.');
