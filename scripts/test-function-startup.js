import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

// Check seed resolution in both native ESM and Netlify's bundled CommonJS.
const source = fs.readFileSync(new URL('../netlify/functions/db.js', import.meta.url), 'utf8');
const moduleDir = fileURLToPath(new URL('../netlify/functions/', import.meta.url)).replace(/\/$/, '');
const resolver = source.split('\n').find(line => line.startsWith('const moduleDir ='));
for (const commonJS of [true, false]) {
  const resolved = vm.runInNewContext(resolver.replaceAll('import.meta.url', 'moduleUrl') + '\nmoduleDir', {
    path, fileURLToPath,
    ...(commonJS ? { __dirname: moduleDir } : {}),
    moduleUrl: commonJS ? undefined : new URL('../netlify/functions/db.js', import.meta.url).href,
  });
  assert.equal(resolved, moduleDir);
  assert.ok(fs.existsSync(path.join(resolved, 'data/website-data.json')));
}

// Exercise the actual serverless adapter without sending or printing credentials.
// Random test-only values ensure this check never uses deployed credentials.
process.env.ADMIN_USERNAME = randomUUID();
process.env.ADMIN_PASSWORD = randomUUID();
process.env.JWT_SECRET = randomUUID();
const { handler } = await import('../netlify/functions/api.js');
for (const requestPath of ['/api/admin/login', '/.netlify/functions/api/admin/login']) {
  const response = await handler({
    httpMethod: 'POST', path: requestPath, headers: { 'content-type': 'application/json' },
    body: '{}', isBase64Encoded: false, requestContext: {}, queryStringParameters: null
  }, {});
  assert.equal(response.statusCode, 400);
  assert.equal(JSON.parse(response.body).message, 'Username and password required');
}
console.log('Native ESM/CommonJS seed resolution and serverless request routing passed.');
