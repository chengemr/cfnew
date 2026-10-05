import assert from 'node:assert/strict';
import test from 'node:test';
import { ORIGIN, UUID, environment, loadWorker, mockKV, request } from './helpers/worker.mjs';
import { context, flush, xhttpRequest, websocketRuntime } from './helpers/transports.mjs';
import { timerRuntime } from './helpers/timers.mjs';
import { parseProxy } from '../src/transports/proxy.js';

const configPath = `/${UUID}/api/config`;
const preferredPath = `/${UUID}/api/preferred-ips`;
const post = body => ({ method: 'POST', body: JSON.stringify(body) });

for (const u of [undefined, '', 'invalid', '11111111-1111-4111-8111-11111111111g', {}, 1]) {
  test(`invalid or absent U (${JSON.stringify(u)}) fails before KV or network access`, async t => {
    const runtime = websocketRuntime();
    const { worker } = await loadWorker(t, { globals: runtime.globals });
    const C = mockKV();
    const env = environment({ C, u });
    for (const input of [new Request(ORIGIN + '/351c9981-04b6-4103-aa4b-864aa9c91469/api/config'),
      new Request(ORIGIN, { headers: { Upgrade: 'websocket' } }), xhttpRequest()]) {
      const response = await worker.fetch(input, env, context);
      assert.equal(response.status, 503);
      assert.match((await response.json()).error, /U.*UUID/);
    }
    assert.deepEqual(C.reads, []);
    assert.deepEqual(C.writes, []);
    assert.equal(runtime.pairs.length, 0);
  });
}

for (const body of [null, [], 'text', { homepage: {} }, { yx: [] }, { ev: 'perhaps' },
  { qj: 'maybe' }, { alpn: 'garbage' }, { d: '/a/../b' }, { d: '/' }, { d: '/a/%2e%2e/b' }, { d: '/路径' }, { homepage: 'javascript:alert(1)' },
  { homepage: 'x'.repeat(8193) }, JSON.parse('{"__proto__":{"polluted":true}}')]) {
  test(`config rejects invalid body ${JSON.stringify(body).slice(0, 90)} without KV writes`, async t => {
    const { worker } = await loadWorker(t);
    const C = mockKV({ yx: 'saved.example:443' });
    const response = await request(worker, environment({ C }), configPath, post(body));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).success, false);
    assert.deepEqual(C.writes, []);
    assert.deepEqual(JSON.parse(C.data.get('c')), { yx: 'saved.example:443' });
  });
}

test('malformed JSON is a client error without a KV write', async t => {
  const { worker } = await loadWorker(t);
  const C = mockKV();
  assert.equal((await request(worker, environment({ C }), configPath, { method: 'POST', body: '{bad' })).status, 400);
  assert.deepEqual(C.writes, []);
});

test('valid config retains switch aliases, unknown extension data and reset semantics', async t => {
  const { worker } = await loadWorker(t);
  const C = mockKV({ homepage: 'https://saved.example', extensionKey: { flag: true } });
  const response = await request(worker, environment({ C }), configPath,
    post({ ev: true, et: 'OFF', ex: 1, homepage: null, scu: 'https://legacy.example/sub' }));
  assert.equal(response.status, 200);
  const config = (await response.json()).config;
  assert.equal(config.ev, 'yes');
  assert.equal(config.et, 'no');
  assert.equal(config.ex, 'yes');
  assert.deepEqual(config.extensionKey, { flag: true });
  assert.equal(config.homepage, '');
  assert.equal(config.scu, 'https://legacy.example/sub');
});

for (const name of ['one,two', 'one#two', 'bad\nname', {}, 'x'.repeat(257)]) {
  test(`preferred name ${JSON.stringify(name).slice(0, 60)} is rejected without serializing ambiguous nodes`, async t => {
    const { worker } = await loadWorker(t);
    const C = mockKV({ ae: 'yes', yx: 'saved.example:443#saved' });
    const response = await request(worker, environment({ C }), preferredPath, post({ ip: 'new.example', name }));
    assert.equal(response.status, 400);
    assert.deepEqual(C.writes, []);
    assert.equal((await (await request(worker, environment({ C }), preferredPath)).json()).count, 1);
  });
}

for (const body of [null, [null], { ip: {} }, { ip: 123 }, { ip: 'new.example', port: 0 }]) {
  test(`preferred input ${JSON.stringify(body)} is a client error`, async t => {
    const { worker } = await loadWorker(t);
    const C = mockKV({ ae: 'yes' });
    assert.equal((await request(worker, environment({ C }), preferredPath, post(body))).status, 400);
    assert.deepEqual(C.writes, []);
  });
}

for (const kind of ['socks5', 'http', 'https']) {
  for (const port of ['0', '-1', '65536', '1.5', '1e3', '80oops', '']) {
    test(`${kind} rejects explicit invalid port ${JSON.stringify(port)}`, () => {
      assert.throws(() => parseProxy(`${kind}://proxy.example:${port}`));
    });
  }
}

test('proxy parsing keeps bare SOCKS, HTTP default ports and bracketed IPv6 compatibility', () => {
  assert.equal(parseProxy('user:pass@proxy.example:1080').socksPort, 1080);
  assert.equal(parseProxy('http://proxy.example').socksPort, 80);
  assert.equal(parseProxy('https://proxy.example').socksPort, 443);
  assert.equal(parseProxy('socks5://[2001:db8::1]:1080').hostname, '[2001:db8::1]');
});

for (const phase of ['headers', 'body', 'size']) {
  test(`custom homepage ${phase} is bounded and falls back to the built-in page`, async t => {
    const timers = timerRuntime();
    let cancelled = false;
    const { worker } = await loadWorker(t, { globals: { ...timers.globals, console: { ...console, error() {} },
      fetch: async (_url, { signal }) => {
        if (phase === 'headers') return new Promise((_, reject) => signal?.addEventListener('abort', () => { cancelled = true; reject(signal.reason); }));
        return new Response(new ReadableStream({ start(controller) {
          if (phase === 'size') controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
        }, cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'text/html' } });
      }
    } });
    let response;
    const pending = request(worker, environment({ homepage: 'https://homepage.example' }), '/').then(value => { response = value; });
    await flush();
    await timers.tick(60_000);
    assert.equal(response?.status, 200);
    await pending;
    assert.match(await response.text(), /CFnew/);
    assert.equal(cancelled, true);
    assert.equal(timers.pending.size, 0);
  });
}

for (const phase of ['headers', 'body', 'size']) {
  test(`built-in preferred source ${phase} is bounded and falls back to native nodes`, async t => {
    const timers = timerRuntime();
    let cancelled = false;
    const { worker } = await loadWorker(t, { globals: { ...timers.globals,
      crypto: { subtle: { async digest() { return new Uint8Array(16).buffer; } } },
      fetch: async (_url, { signal }) => {
        if (phase === 'headers') return new Promise((_, reject) => signal?.addEventListener('abort', () => { cancelled = true; reject(signal.reason); }));
        return new Response(new ReadableStream({ start(controller) {
          if (phase === 'size') controller.enqueue(new Uint8Array(1024 * 1024 + 1));
        }, cancel() { cancelled = true; } }));
      }
    } });
    let response;
    const pending = request(worker, environment({ epd: 'no', egi: 'no', ex: 'no', et: 'no' })).then(value => { response = value; });
    await flush();
    await timers.tick(60_000);
    assert.equal(response?.status, 200);
    await pending;
    assert.match(atob(await response.text()), /127\.0\.0\.1/);
    assert.equal(cancelled, true);
    assert.equal(timers.pending.size, 0);
  });
}

for (const kind of ['socks5', 'http']) {
  test(`${kind} authentication sends the exact UTF-8 bytes for non-ASCII credentials`, async t => {
    let incoming, end;
    const writes = [], tasks = [];
    const socket = {
      opened: Promise.resolve(), closed: new Promise(resolve => { end = resolve; }),
      readable: new ReadableStream({ start(controller) { incoming = controller; } }),
      writable: new WritableStream({ write(data) {
        writes.push(data.slice());
        if (kind === 'http') incoming.enqueue(new TextEncoder().encode('HTTP/1.1 200 OK\r\n\r\n'));
        else if (writes.length === 1) incoming.enqueue(Uint8Array.of(5, 2));
        else if (writes.length === 2) incoming.enqueue(Uint8Array.of(1, 0));
        else incoming.enqueue(Uint8Array.of(5, 0, 0, 1, 127, 0, 0, 1, 0, 80));
      } }),
      close() { try { incoming.close(); } catch {} end(); }
    };
    const { worker } = await loadWorker(t, { connect: () => socket });
    const response = await worker.fetch(xhttpRequest(), environment({ qj: 'only', s: `${kind}://用户:密码@proxy.example:1080` }),
      { waitUntil(task) { tasks.push(task); } });
    t.after(async () => { await response.body?.cancel(); socket.close(); await Promise.allSettled(tasks); });
    assert.equal(response.status, 200);
    if (kind === 'socks5') {
      const username = new TextEncoder().encode('用户'), password = new TextEncoder().encode('密码');
      assert.deepEqual([...writes[1]], [1, username.length, ...username, password.length, ...password]);
    } else {
      const auth = new TextDecoder().decode(writes[0]).match(/Proxy-Authorization: Basic (\S+)/)[1];
      assert.equal(new TextDecoder().decode(Uint8Array.from(atob(auth), char => char.charCodeAt(0))), '用户:密码');
    }
  });
}

test('SOCKS credentials over the protocol byte limit are rejected before dialing', async t => {
  const attempts = [];
  const { worker } = await loadWorker(t, { connect(target) { attempts.push(target); throw new Error('unexpected dial'); } });
  assert.equal((await worker.fetch(xhttpRequest(), environment({ qj: 'only', s: `socks5://${'用'.repeat(86)}:password@proxy.example:1080` }), context)).status, 500);
  assert.deepEqual(attempts, []);
});

test('a malformed preferred batch never partially saves valid entries', async t => {
  const { worker } = await loadWorker(t);
  const C = mockKV({ ae: 'yes' });
  assert.equal((await request(worker, environment({ C }), preferredPath, post([{ ip: 'valid.example' }, { ip: 'invalid' }]))).status, 400);
  assert.deepEqual(C.writes, []);
});

for (const token of [UUID.toUpperCase(), UUID.replaceAll('-', '')]) {
  test(`uppercase U alias accepts existing UUID form ${token}`, async t => {
    const { worker } = await loadWorker(t);
    const env = environment({ u: undefined, U: token, C: mockKV() });
    assert.equal((await request(worker, env, `/${token.toLowerCase()}/api/config`)).status, 200);
  });
}

test('a historic non-string homepage safely falls back without changing KV', async t => {
  const { worker } = await loadWorker(t);
  const C = mockKV({ homepage: {} });
  const response = await request(worker, environment({ C }), '/');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /CFnew/);
  assert.deepEqual(C.writes, []);
});

test('homepage headers ignoring abort cannot hold a request past its deadline', async t => {
  const timers = timerRuntime();
  const { worker } = await loadWorker(t, { globals: { ...timers.globals,
    console: { ...console, error() {} }, fetch: () => new Promise(() => {}) } });
  let response;
  const pending = request(worker, environment({ homepage: 'https://stalled.example' }), '/').then(value => { response = value; });
  await flush();
  await timers.tick(5_000);
  assert.equal(response?.status, 200);
  await pending;
  assert.equal(timers.pending.size, 0);
});

test('accepted API, region and preferred switches use their canonical behavior', async t => {
  const { worker } = await loadWorker(t);
  const C = mockKV();
  const env = environment({ C });
  const saved = await request(worker, env, configPath, post({ ae: true, rm: false, yxby: 'ON' }));
  assert.equal(saved.status, 200);
  const config = (await saved.json()).config;
  assert.deepEqual([config.ae, config.rm, config.yxby], ['yes', 'no', 'yes']);
  assert.equal((await request(worker, env, preferredPath)).status, 200);
});

test('an optional null preferred name keeps the default-name behavior', async t => {
  const { worker } = await loadWorker(t);
  const env = environment({ C: mockKV({ ae: 'yes' }) });
  const response = await request(worker, env, preferredPath, post({ ip: 'example.com', name: null }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.addedIPs[0].name, 'API优选-example.com:443');
});
