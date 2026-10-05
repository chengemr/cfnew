import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { ORIGIN, UUID, environment, loadWorker } from './helpers/worker.mjs';
import { flush, requestWithBody, vlessHeader, websocketRuntime, xhttpRequest } from './helpers/transports.mjs';
import { timerRuntime } from './helpers/timers.mjs';

const primary = '192.0.2.10';
const payload = Uint8Array.of(7, 8, 9);
const packet = transport => transport === 'trojan'
  ? Uint8Array.of(...new TextEncoder().encode(createHash('sha224').update(UUID).digest('hex')),
    13, 10, 1, 1, 192, 0, 2, 10, 1, 187, 13, 10, ...payload)
  : Uint8Array.of(...vlessHeader(), ...payload);

async function route(t, transport, env, {
  proxyPrimaryWorks = false, query = '', input, timers, stallPrimary = false, stallProxyPrimary = false
} = {}) {
  const attempts = [], sockets = [], tasks = [], received = [];
  const runtime = websocketRuntime();
  const { worker } = await loadWorker(t, { globals: { ...runtime.globals, ...timers?.globals,
    Math: Object.assign(Object.create(Math), { random: () => 0 })
  }, connect(target) {
    const proxy = target.hostname === 'proxy.example';
    if (!proxy) {
      attempts.push(['direct', target.hostname, target.port]);
      if (target.hostname === primary && !stallPrimary) throw new Error('fixture direct failure');
    }
    let incoming, resolveClosed;
    const socket = {
      writes: [], opened: Promise.resolve(),
      closed: new Promise(resolve => { resolveClosed = resolve; }),
      readable: new ReadableStream({ start(controller) {
        incoming = controller;
        if (!proxy && !(stallPrimary && target.hostname === primary)) controller.enqueue(Uint8Array.of(42));
      } }),
      writable: new WritableStream({ write(data) {
        socket.writes.push(data.slice());
        if (!proxy) return;
        if (socket.writes.length === 1) incoming.enqueue(Uint8Array.of(5, 0));
        else if (socket.writes.length === 2) {
          const host = new TextDecoder().decode(data.slice(5, 5 + data[4]));
          attempts.push(['proxy', host, (data.at(-2) << 8) | data.at(-1)]);
          const failed = host === primary && !proxyPrimaryWorks;
          incoming.enqueue(Uint8Array.of(5, failed ? 1 : 0, 0, 1, 127, 0, 0, 1, 0, 80,
            ...(failed || (stallProxyPrimary && host === primary) ? [] : [42])));
        }
      } }),
      close() { try { incoming.close(); } catch {} resolveClosed(); }
    };
    sockets.push(socket);
    return socket;
  } });
  const context = { waitUntil(task) { tasks.push(task); } };
  let reader;
  t.after(async () => {
    runtime.pairs[0]?.[1].close();
    await reader?.cancel().catch(() => {});
    reader?.releaseLock();
    sockets.forEach(socket => socket.close());
    await Promise.allSettled(tasks);
    await flush();
  });
  let success;
  if (transport === 'xhttp') {
    const response = await worker.fetch(input || xhttpRequest(packet(transport)), environment(env), context);
    success = response.status === 200;
    assert.equal(response.status, success ? 200 : 500);
    if (success) {
      reader = response.body.getReader();
      assert.deepEqual([...((await reader.read()).value)], [0, 0]);
      assert.deepEqual([...((await reader.read()).value)], [42]);
    }
  } else {
    await worker.fetch(new Request(ORIGIN + '/' + query, { headers: { Upgrade: 'websocket' } }),
      environment(env), context);
    const websocket = runtime.pairs[0][1];
    websocket.send = data => received.push(...data);
    websocket.receive(packet(transport));
    for (let i = 0; i < 5; i++) await flush();
    if (timers) { await timers.tick(3_510); await timers.tick(10); }
    else await new Promise(resolve => setTimeout(resolve, 15));
    success = websocket.readyState === 1;
    if (success) assert.deepEqual(received, transport === 'trojan' ? [42] : [0, 0, 42]);
  }
  if (success) assert.ok(sockets.some(socket => socket.writes.some(data =>
    data.length === payload.length && data.every((byte, index) => byte === payload[index]))),
    'initial client payload did not reach the selected outbound socket');
  return { attempts, success };
}

const policies = [
  ['direct fallback', '', '', false, true, ['direct', 'direct', 'direct', 'direct']],
  ['proxy fallback', '', 'proxy.example:1080', false, true, ['proxy', 'proxy']],
  ['direct then proxy then direct fallback', 'no', 'proxy.example:1080', false, true,
    ['direct', 'direct', 'proxy', 'direct', 'direct']],
  ['direct then working proxy', 'no', 'proxy.example:1080', true, true, ['direct', 'direct', 'proxy']],
  ['only proxy fails without fallback', 'only', 'proxy.example:1080', false, false, ['proxy']],
  ['only proxy succeeds', 'only', 'proxy.example:1080', true, true, ['proxy']]
];
for (const transport of ['vless', 'trojan', 'xhttp']) {
  for (const [name, qj, s, proxyPrimaryWorks, success, kinds] of policies) {
    test(`${transport}: ${name} preserves routing and the first payload`, async t => {
      const result = await route(t, transport, { qj, s, p: 'fallback.example:8443' }, { proxyPrimaryWorks });
      assert.equal(result.success, success);
      assert.deepEqual(result.attempts.map(item => item[0]), kinds);
      assert.deepEqual(result.attempts.at(-1).slice(1), success && !proxyPrimaryWorks
        ? ['fallback.example', 8443] : [primary, 443]);
    });
  }
  for (const wk of ['HK', 'US', 'SG', 'JP', 'KR', 'DE', 'SE', 'NL', 'FI', 'GB',
    'Oracle', 'DigitalOcean', 'Vultr', 'Multacom', 'unknown', 'CF', '']) {
    test(`${transport}: region ${wk || 'default'} retains its existing fallback`, async t => {
      const { attempts, success } = await route(t, transport, { wk });
      const region = ['HK', 'US', 'SG', 'JP', 'KR', 'DE', 'SE', 'NL', 'FI', 'GB'].includes(wk) ? wk : 'US';
      const host = wk === 'CF' || wk === '' ? '172.71.218.190' : `ProxyIP.${region}.CMLiussss.net`;
      assert.equal(success, true);
      assert.deepEqual(attempts, [['direct', primary, 443], ['direct', primary, 443],
        ['direct', host, 443], ['direct', host, 443]]);
    });
  }
  test(`${transport}: disabled region matching retains the first fixed fallback`, async t => {
    const { attempts } = await route(t, transport, { wk: 'JP', rm: 'no' });
    assert.deepEqual(attempts.at(-1), ['direct', 'ProxyIP.HK.CMLiussss.net', 443]);
  });
  test(`${transport}: explicit IPv6 fallback retains its custom port`, async t => {
    const { attempts } = await route(t, transport, { p: '[2001:db8::1]:9443' });
    assert.deepEqual(attempts.at(-1), ['direct', '2001:db8::1', 9443]);
  });
}
test('WebSocket request parameters retain precedence over environment fallback and region', async t => {
  const { attempts } = await route(t, 'vless', { p: 'env.example:443', wk: 'SG' },
    { query: '?p=request.example:9443&wk=JP&rm=no' });
  assert.deepEqual(attempts.at(-1), ['direct', 'request.example', 9443]);
});

test('fragmented XHTTP options and domain headers retain the initial payload', async t => {
  const prefix = vlessHeader().slice(0, 18);
  prefix[17] = 20;
  const bytes = Uint8Array.of(...prefix, ...Array(20).fill(0), 1, 1, 187, 2, 11,
    ...new TextEncoder().encode('example.com'), ...payload);
  const chunks = [bytes.slice(0, 18), bytes.slice(18, 43), bytes.slice(43)];
  const input = requestWithBody(new ReadableStream({ type: 'bytes', pull(controller) {
    if (chunks.length) controller.enqueue(chunks.shift());
    else { controller.close(); controller.byobRequest?.respond(0); }
  } }));
  const { attempts, success } = await route(t, 'xhttp', {}, { input });
  assert.equal(success, true);
  assert.deepEqual(attempts, [['direct', 'example.com', 443], ['direct', 'example.com', 443]]);
});

async function queuedWebSocket(t) {
  const runtime = websocketRuntime();
  const sockets = [], writes = [];
  let release, started;
  const blocked = new Promise(resolve => { release = resolve; });
  const writing = new Promise(resolve => { started = resolve; });
  const { worker } = await loadWorker(t, { globals: runtime.globals, connect() {
    let incoming, resolveClosed;
    const socket = {
      opened: Promise.resolve(), closed: new Promise(resolve => { resolveClosed = resolve; }),
      readable: new ReadableStream({ start(controller) { incoming = controller; controller.enqueue(Uint8Array.of(42)); } }),
      writable: new WritableStream({ async write(data) {
        started();
        if (!writes.length) await blocked;
        writes.push(data.slice());
      } }),
      close() { try { incoming.close(); } catch {} resolveClosed(); }
    };
    sockets.push(socket);
    return socket;
  } });
  await worker.fetch(new Request(ORIGIN, { headers: { Upgrade: 'websocket' } }), environment(), { waitUntil() {} });
  const websocket = runtime.pairs[0][1];
  t.after(async () => { release(); websocket.close(); sockets.forEach(socket => socket.close()); await flush(); });
  websocket.receive(vlessHeader());
  for (let i = 0; i < 5; i++) await flush();
  websocket.receive(new Uint8Array(512).fill(0));
  await writing;
  return { websocket, release, writes };
}

test('WebSocket backpressure preserves byte order across pooled upload batches', async t => {
  const { websocket, release, writes } = await queuedWebSocket(t);
  for (let i = 1; i < 120; i++) websocket.receive(new Uint8Array(512).fill(i));
  for (let i = 0; i < 5; i++) await flush();
  release();
  for (let i = 0; i < 10; i++) await flush();
  assert.equal(websocket.readyState, 1);
  assert.deepEqual(Buffer.concat(writes), Buffer.concat(Array.from({ length: 120 }, (_, i) => Buffer.alloc(512, i))));
});

test('WebSocket upload queue overflow closes the connection instead of discarding live data', async t => {
  const { websocket } = await queuedWebSocket(t);
  for (let i = 0; i < 600; i++) websocket.receive(new Uint8Array(512).fill(i));
  for (let i = 0; i < 10; i++) await flush();
  assert.equal(websocket.readyState, 3);
});

for (const [name, qj, s, proxyPrimaryWorks, success, kinds] of policies.filter((_, index) => [0, 2, 3].includes(index))) {
  test(`WebSocket first-byte timeout: ${name} retains its fallback policy`, async t => {
    const timers = timerRuntime();
    const result = await route(t, 'vless', { qj, s, p: 'fallback.example:8443' },
      { timers, stallPrimary: true, proxyPrimaryWorks });
    assert.equal(result.success, success);
    assert.deepEqual(result.attempts.map(item => item[0]), kinds);
    assert.equal(timers.pending.size, 0);
  });
}
test('WebSocket first-byte timeout retries the fallback through the configured proxy', async t => {
  const timers = timerRuntime();
  const result = await route(t, 'vless', { s: 'proxy.example:1080', p: 'fallback.example:8443' },
    { timers, proxyPrimaryWorks: true, stallProxyPrimary: true });
  assert.equal(result.success, true);
  assert.deepEqual(result.attempts, [['proxy', primary, 443], ['proxy', 'fallback.example', 8443]]);
  assert.equal(timers.pending.size, 0);
});
test('WebSocket first-byte timeout in only-proxy mode never opens a direct connection', async t => {
  const timers = timerRuntime();
  const result = await route(t, 'vless', { qj: 'only', s: 'proxy.example:1080', p: 'fallback.example:8443' },
    { timers, proxyPrimaryWorks: true, stallProxyPrimary: true });
  assert.equal(result.success, false);
  assert.deepEqual(result.attempts, [['proxy', primary, 443]]);
  assert.equal(timers.pending.size, 0);
});
