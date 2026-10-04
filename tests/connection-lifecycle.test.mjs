import assert from 'node:assert/strict';
import test from 'node:test';
import { ORIGIN, UUID, environment, loadWorker, request } from './helpers/worker.mjs';
import { context, flush, requestWithBody, vlessHeader, websocketRuntime, xhttpRequest } from './helpers/transports.mjs';

for (const proxy of ['', 'invalid-proxy']) {
  test(`XHTTP only mode makes no direct connection with ${proxy || 'no proxy'}`, async t => {
    const attempts = [];
    const { worker } = await loadWorker(t, { connect(target) { attempts.push(target); throw new Error('mock dial failure'); } });
    const response = await worker.fetch(xhttpRequest(), environment({ qj: 'only', s: proxy }), context);
    assert.equal(response.status, 500);
    assert.deepEqual(attempts, []);
  });

  test(`WebSocket only mode makes no direct connection with ${proxy || 'no proxy'}`, async t => {
    const runtime = websocketRuntime();
    const attempts = [];
    const { worker } = await loadWorker(t, { globals: runtime.globals,
      connect(target) { attempts.push(target); throw new Error('mock dial failure'); } });
    await worker.fetch(new Request(ORIGIN, { headers: { Upgrade: 'websocket' } }),
      environment({ qj: 'only', s: proxy }), context);
    runtime.pairs[0][1].receive(vlessHeader());
    for (let i = 0; i < 5; i++) await flush();
    assert.deepEqual(attempts, []);
    assert.equal(runtime.pairs[0][1].readyState, 3);
  });
}

test('WebSocket protocol selection is fixed at upgrade time', async t => {
  const runtime = websocketRuntime();
  const attempts = [];
  const { worker } = await loadWorker(t, { globals: runtime.globals,
    connect(target) { attempts.push(target); throw new Error('mock dial failure'); } });
  const env = environment({ ev: 'yes', et: 'no', ex: 'no', yx: 'example.com:8443' });
  await worker.fetch(new Request(ORIGIN, { headers: { Upgrade: 'websocket' } }), env, context);
  await request(worker, { ...env, ev: 'no', et: 'yes' }, `/${UUID}/sub`);
  runtime.pairs[0][1].receive(vlessHeader());
  for (let i = 0; i < 5; i++) await flush();
  assert.ok(attempts.some(target => target.hostname === '192.0.2.10' && target.port === 443));
});

test('invalid XHTTP authentication releases the request reader', async t => {
  const { worker } = await loadWorker(t);
  const input = xhttpRequest(vlessHeader('22222222-2222-4222-8222-222222222222'));
  const response = await worker.fetch(input, environment(), context);
  assert.equal(response.status, 500);
  assert.equal(input.body.locked, false);
});

test('failed XHTTP proxy connections do not exhaust the connection limit', async t => {
  let attempts = 0;
  const { worker } = await loadWorker(t, { connect() { attempts++; throw new Error('mock dial failure'); } });
  const env = environment({ qj: 'only', s: 'proxy.example:1080' });
  for (let i = 0; i < 35; i++) {
    const input = xhttpRequest();
    const response = await worker.fetch(input, env, context);
    assert.equal(response.status, 500);
    assert.equal(await response.text(), 'Internal Server Error', `request ${i + 1}`);
    if (i === 34) assert.equal(input.body.locked, false);
  }
  assert.equal(attempts, 35);
});

test('the XHTTP connection limit is returned as HTTP 429', async t => {
  const { worker } = await loadWorker(t);
  const controllers = [];
  const pending = [];
  const env = environment();
  for (let i = 0; i < 32; i++) {
    const stream = new ReadableStream({ type: 'bytes', start(controller) {
      controllers.push(controller);
      controller.enqueue(vlessHeader().slice(0, 18));
    } });
    pending.push(worker.fetch(requestWithBody(stream), env, context));
  }
  t.after(async () => {
    for (const controller of controllers) {
      controller.close();
      controller.byobRequest?.respond(0);
    }
    await Promise.all(pending);
  });
  for (let i = 0; i < 5; i++) await flush();
  const response = await worker.fetch(xhttpRequest(), env, context);
  assert.equal(response.status, 429);
  assert.equal(await response.text(), 'Too many connections');
});
