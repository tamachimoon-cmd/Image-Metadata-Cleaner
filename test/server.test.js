import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../server.js';

async function withServer(fn) {
  const server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await fn('http://127.0.0.1:' + server.address().port); }
  finally { await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve())); }
}
test('entrega interface, CSS, JS e módulo com CSP', async () => {
  await withServer(async base => {
    for (const route of ['/', '/styles.css', '/app.js', '/src/metadata.js', '/favicon.svg']) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200, route);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.match(response.headers.get('content-security-policy'), /connect-src 'none'/);
      assert.ok((await response.text()).length > 20);
    }
  });
});
test('healthcheck e HEAD', async () => {
  await withServer(async base => {
    const health = await fetch(base + '/health');
    assert.deepEqual(await health.json(), { status: 'ok' });
    const head = await fetch(base + '/', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
  });
});
test('nega caminhos fora da allowlist e métodos de upload', async () => {
  await withServer(async base => {
    assert.equal((await fetch(base + '/private.env')).status, 404);
    assert.equal((await fetch(base + '/package.json')).status, 404);
    const response = await fetch(base + '/', { method: 'POST', body: 'test' });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'GET, HEAD');
  });
});
