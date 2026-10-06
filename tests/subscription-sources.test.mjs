import assert from 'node:assert/strict';
import test from 'node:test';
import { parse } from 'yaml';
import { UUID, environment, loadWorker, nodeFields, request, subscription } from './helpers/worker.mjs';
import { timerRuntime } from './helpers/timers.mjs';
import { deferred } from './helpers/deferred.mjs';

const source = 'https://preferred.example/list';
const remoteEnv = environment({ epd: 'no', epi: 'no', egi: 'yes', yxURL: source });

test('remote preferred lists preserve source order and protocol port decisions', async t => {
  const { worker } = await loadWorker(t, { globals: { fetch(url) {
    assert.equal(url, source);
    return new Response('192.0.2.10:8443\nexample.com:8080\n[2001:db8::1]:2083');
  } } });
  const nodes = await subscription(worker, { ...remoteEnv, ex: 'no', dkby: 'no' });
  assert.deepEqual(nodes.map(nodeFields).map(node => [node.protocol, node.server, node.port, node.tls]), [
    ['vless', '192.0.2.10', 8443, true], ['vless', 'example.com', 8080, false],
    ['vless', '2001:db8::1', 2083, true], ['trojan', '192.0.2.10', 8443, true],
    ['trojan', 'example.com', 8080, false], ['trojan', '2001:db8::1', 2083, true]
  ]);
});

for (const target of ['base64', 'clash']) {
  test(`${target}: a Trojan password with URI punctuation survives subscription encoding`, async t => {
    const { worker } = await loadWorker(t);
    const password = 'fixture@password:with/#%';
    const env = environment({ yx: 'example.com:8443', ev: 'no', et: 'yes', ex: 'no', tp: password });
    const response = await request(worker, env, `/${UUID}/sub?target=${target}`);
    assert.equal(response.status, 200);
    const text = await response.text();
    if (target === 'clash') assert.equal(parse(text).proxies[0].password, password);
    else {
      const url = new URL(atob(text));
      assert.equal(decodeURIComponent(url.username), password);
      assert.equal(url.hostname, 'example.com');
    }
  });
}

test('environment IP-family and ISP filters apply to fetched address nodes', async t => {
  const { worker } = await loadWorker(t, { globals: {
    crypto: { subtle: { async digest(algorithm) {
      assert.equal(algorithm, 'MD5');
      return new Uint8Array(16).buffer;
    } } },
    fetch(url) {
      assert.equal(new URL(url).hostname, 'api.uouin.com');
      return Response.json({ data: {
        ctcc: { info: [{ ip: '192.0.2.10' }] },
        cmcc: { info: [{ ip: '192.0.2.20' }] },
        ipv6: { info: [{ ip: '2001:db8::1' }] }
      } });
    }
  } });
  const nodes = await subscription(worker, environment({ epd: 'no', egi: 'no', et: 'no', ex: 'no',
    ispMobile: 'NO', ipv6: false }));
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].hostname, '192.0.2.10');
});

test('failed preferred fetches clear timers and do not retry without a deadline', async t => {
  const timers = timerRuntime();
  let calls = 0;
  const { worker } = await loadWorker(t, { globals: { ...timers.globals, fetch(url) {
    assert.equal(url, source);
    calls++;
    throw new Error('fixture source failure');
  } } });
  assert.equal((await request(worker, remoteEnv)).status, 503);
  assert.equal(calls, 1);
  assert.equal(timers.pending.size, 0);
});

test('preferred-source deadlines also cover reading a stalled response body', async t => {
  const timers = timerRuntime();
  const started = deferred();
  let bodyController;
  const { worker } = await loadWorker(t, { globals: { ...timers.globals, fetch(url, { signal }) {
    assert.equal(url, source);
    return new Response(new ReadableStream({ start(controller) {
      bodyController = controller;
      signal.addEventListener('abort', () => controller.error(new Error('fixture body timeout')));
    }, pull() { started.resolve(); } }, { highWaterMark: 0 }));
  } } });
  const pending = request(worker, remoteEnv);
  t.after(async () => { bodyController.error(new Error('fixture cleanup')); await pending; });
  await started.promise;
  await timers.tick(5_000);
  let settled = false;
  pending.then(() => { settled = true; });
  await timers.tick(0);
  assert.equal(settled, true, 'reading the source body exceeded the request deadline');
  const response = await pending;
  assert.equal(response.status, 503);
  assert.match(await response.text(), /有效节点/);
  assert.equal(bodyController.desiredSize, null);
  assert.equal(timers.pending.size, 0);
});

test('HTTP error bodies are not treated as preferred node lists', async t => {
  const { worker } = await loadWorker(t, { globals: { fetch(url) {
    assert.equal(url, source);
    return new Response('192.0.2.10:8443', { status: 503 });
  } } });
  const response = await request(worker, remoteEnv);
  assert.equal(response.status, 503);
  assert.match(await response.text(), /有效节点/);
});

test('bare IPv6 source entries use the default port without losing the address', async t => {
  const { worker } = await loadWorker(t, { globals: { fetch(url) {
    assert.equal(url, source);
    return new Response('2001:db8::1');
  } } });
  const nodes = await subscription(worker, { ...remoteEnv, et: 'no', ex: 'no' });
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].hostname, '[2001:db8::1]');
  assert.equal(nodes[0].port, '443');
});
