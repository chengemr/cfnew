import assert from 'node:assert/strict';
import test from 'node:test';
import { environment, loadWorker, UUID, ORIGIN, ADMIN_TOKEN, mockKV, request } from './helpers/worker.mjs';
import { timerRuntime } from './helpers/timers.mjs';
import { flush } from './helpers/transports.mjs';

for (const [suffix, method] of [['config', 'POST'], ['preferred-ips', 'POST'], ['preferred-ips', 'DELETE']]) {
  for (const mode of ['deadline', 'stream-size', 'advertised-size']) {
    test(`${method} ${suffix} rejects ${mode} and clears readers/timers without KV writes`, async t => {
      const timers = timerRuntime();
      let cancelled = false, reads = 0;
      const body = new ReadableStream({
        pull(controller) { reads++; if (mode === 'stream-size') controller.enqueue(new Uint8Array(512 * 1024 + 1)); },
        cancel() { cancelled = true; }
      }, { highWaterMark: 0 });
      const { worker } = await loadWorker(t, { globals: timers.globals });
      const C = mockKV({ ae: 'yes', yx: 'saved.example:443' });
      const input = new Request(`${ORIGIN}/${UUID}/api/${suffix}`, {
        method, headers: { Authorization: `Bearer ${ADMIN_TOKEN}`,
          ...(mode === 'advertised-size' ? { 'Content-Length': String(512 * 1024 + 1) } : {}) },
        body, duplex: 'half'
      });
      const pending = worker.fetch(input, environment({ C }), { waitUntil() {} });
      await flush();
      if (mode === 'deadline') await timers.tick(5000);
      const response = await pending;
      assert.equal(response.status, mode === 'deadline' ? 408 : 413);
      assert.equal((await response.json()).success, false);
      assert.equal(cancelled, true);
      assert.equal(input.body.locked, false);
      assert.equal(timers.pending.size, 0);
      if (mode === 'advertised-size') assert.equal(reads, 0);
      assert.deepEqual(C.writes, []);
      assert.deepEqual(JSON.parse(C.data.get('c')), { ae: 'yes', yx: 'saved.example:443' });
    });
  }
}

test('large valid configuration bodies keep Unicode values and reset semantics', async t => {
  const timers = timerRuntime();
  const { worker } = await loadWorker(t, { globals: timers.globals });
  const C = mockKV({ homepage: 'https://saved.example' });
  const changes = { yx: '192.0.2.10:443#中文'.repeat(4000), homepage: null };
  const response = await request(worker, environment({ C }), `/${UUID}/api/config`, { method: 'POST', body: JSON.stringify(changes) });
  assert.equal(response.status, 200);
  const config = (await response.json()).config;
  assert.equal(config.yx, changes.yx);
  assert.equal(config.homepage, '');
  assert.equal(timers.pending.size, 0);
});

test('oversized preferred batches and total lists fail atomically; batch duplicates remain skipped', async t => {
  const { worker } = await loadWorker(t);
  const C = mockKV({ ae: 'yes', yx: 'saved.example:443' });
  const path = `/${UUID}/api/preferred-ips`;
  const items = Array.from({ length: 1025 }, (_, index) => ({ ip: `a${index}.test` }));
  const post = body => request(worker, environment({ C }), path, { method: 'POST', body: JSON.stringify(body) });
  assert.equal((await post(items)).status, 400);
  assert.equal((await post(items.slice(0, 1024))).status, 413);
  assert.deepEqual(C.writes, []);
  const response = await post([{ ip: 'new.example' }, { ip: 'new.example' }]);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.added, 1);
  assert.equal(data.skipped, 1);
});

test('multi-URL preferred sources validate each URL and reject excessive sources before saving', async t => {
  const { worker } = await loadWorker(t);
  const C = mockKV();
  const post = yxURL => request(worker, environment({ C }), `/${UUID}/api/config`, { method: 'POST', body: JSON.stringify({ yxURL }) });
  assert.equal((await post('https://a.example/list, javascript:alert(1)')).status, 400);
  assert.equal((await post(Array.from({ length: 17 }, (_, i) => `https://s${i}.example/list`).join(','))).status, 400);
  assert.deepEqual(C.writes, []);
  assert.equal((await post('https://a.example/list, https://b.example/list')).status, 200);
});
