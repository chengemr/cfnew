import assert from 'node:assert/strict';
import test from 'node:test';
import { parse } from 'yaml';
import { UUID, environment, loadWorker, request } from './helpers/worker.mjs';
import { deferred } from './helpers/deferred.mjs';
import { residentialResponse } from './helpers/residential.mjs';
import { timerRuntime } from './helpers/timers.mjs';

const path = `/${UUID}/sub?target=vg`;
const env = environment({ jk: 'yes', yx: 'example.com:8443', ech: 'yes',
  customECHDomain: 'ech.example' });

test('residential subscriptions render shared front nodes and ECH settings', async t => {
  const { worker } = await loadWorker(t, { globals: { fetch: residentialResponse } });
  const response = await request(worker, env, path);
  assert.equal(response.status, 200, await response.clone().text());
  const config = parse(await response.text());
  const front = config.proxies.filter(node => node.type !== 'openvpn');
  assert.equal(front.length, 3);
  assert.ok(front.every(node => node.port === 8443));
  assert.ok(front.every(node => node['ech-opts']['query-server-name'] === 'ech.example'));
  const residential = config.proxies.find(node => node.type === 'openvpn');
  assert.equal(residential.server, '192.0.2.20');
  assert.equal(residential['dialer-proxy'], '⚡ CF前置');
});

test('concurrent residential requests share one source fetch', async t => {
  const started = deferred();
  const gate = deferred();
  let calls = 0;
  const { worker } = await loadWorker(t, { globals: { async fetch(url) {
    calls++;
    started.resolve();
    await gate.promise;
    return residentialResponse(url);
  } } });
  const first = request(worker, env, path);
  await started.promise;
  const second = request(worker, env, path);
  gate.resolve();
  const responses = await Promise.all([first, second]);
  assert.ok(responses.every(response => response.status === 200));
  assert.equal(calls, 1);
});

test('residential source failures preserve HTTP 503 and allow retry', async t => {
  let fail = true;
  const { worker } = await loadWorker(t, { globals: { fetch(url) {
    if (fail) throw new Error('fixture source failure');
    return residentialResponse(url);
  } } });
  assert.equal((await request(worker, env, path)).status, 503);
  fail = false;
  assert.equal((await request(worker, env, path)).status, 200);
});

for (const stage of ['fetch', 'body']) {
  test(`stalled residential ${stage} releases shared requests and permits recovery`, async t => {
    const timers = timerRuntime();
    const started = deferred();
    const signals = [];
    let stalled = true;
    let calls = 0;
    const { worker } = await loadWorker(t, { globals: { ...timers.globals, fetch(url, { signal }) {
      calls++;
      signals.push(signal);
      if (!stalled) return residentialResponse(url);
      started.resolve();
      // Deliberately ignore abort for the headers fixture: the deadline must
      // still release the shared loading Promise if the underlying request stalls.
      if (stage === 'fetch') return new Promise(() => {});
      return new Response(new ReadableStream({ start(controller) {
        signal.addEventListener('abort', () => controller.error(new Error('fixture body abort')));
      } }));
    } } });
    const first = request(worker, env, path);
    await started.promise;
    const second = request(worker, env, path);
    await timers.tick(0);
    assert.equal(calls, 1, 'concurrent requests must share the current load');
    await timers.tick(20_000); // HTTPS and the existing HTTP fallback each get 10 seconds.
    const responses = await Promise.all([first, second]);
    assert.ok(responses.every(response => response.status === 503));
    assert.equal(calls, 2);
    assert.ok(signals.every(signal => signal.aborted));
    assert.equal(timers.pending.size, 0, 'failed loads must clear deadline timers');

    stalled = false;
    const recovered = await request(worker, env, path);
    assert.equal(recovered.status, 200);
    assert.equal(calls, 3, 'the failed shared load must be cleared before retry');
    const config = parse(await recovered.text());
    assert.ok(config.proxies.some(node => node.type === 'openvpn'));
    assert.equal(timers.pending.size, 0, 'successful loads must clear deadline timers');
  });
}
