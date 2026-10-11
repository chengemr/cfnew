import assert from 'node:assert/strict';
import test from 'node:test';
import { environment, loadWorker, UUID, request, subscription } from './helpers/worker.mjs';
import { deferred } from './helpers/deferred.mjs';
import { flush } from './helpers/transports.mjs';

const source = 'https://preferred.example/list';
const env = environment({ epd: 'no', epi: 'no', egi: 'yes', yxURL: source, et: 'no', ex: 'no' });
const servers = nodes => nodes.map(node => node.hostname);

test('simultaneous subscriptions and target formats share one preferred fetch and fresh cache', async t => {
  const started = deferred(), gate = deferred();
  let calls = 0;
  const { worker } = await loadWorker(t, { globals: { async fetch() {
    calls++; started.resolve(); await gate.promise; return new Response('edge.example:443');
  } } });
  const first = request(worker, env);
  await started.promise;
  const second = request(worker, env, `/${UUID}/sub?target=clash`);
  const third = request(worker, env, `/${UUID}/sub?target=singbox`);
  gate.resolve();
  const responses = await Promise.all([first, second, third]);
  assert.ok(responses.every(response => response.status === 200));
  assert.deepEqual(servers(await subscription(worker, env)), ['edge.example']);
  assert.equal(calls, 1);
});

test('preferred cache expires, shares failed refreshes, and never extends stale data lifetime', async t => {
  let calls = 0, body = 'first.example:443';
  const { worker, advanceTime } = await loadWorker(t, { globals: { fetch() {
    calls++; return body === null ? new Response('fixture failure', { status: 503 }) : new Response(body);
  } } });
  assert.deepEqual(servers(await subscription(worker, env)), ['first.example']);
  advanceTime(179_999);
  assert.deepEqual(servers(await subscription(worker, env)), ['first.example']);
  assert.equal(calls, 1);
  body = 'second.example:443'; advanceTime(1);
  assert.deepEqual(servers(await subscription(worker, env)), ['second.example']);
  assert.equal(calls, 2);
  body = null; advanceTime(180_000);
  const responses = await Promise.all([request(worker, env), request(worker, env)]);
  assert.ok(responses.every(response => response.status === 200));
  assert.equal(calls, 3);
  assert.deepEqual(servers(await subscription(worker, env)), ['second.example']);
  assert.equal(calls, 3, 'outage retries must pause briefly without extending stale lifetime');
  advanceTime(720_000);
  assert.equal((await request(worker, env)).status, 503);
  body = 'recovered.example:443';
  assert.deepEqual(servers(await subscription(worker, env)), ['recovered.example']);
});

for (const badBody of ['', 'not a valid node', 'edge.example:65536']) {
  test(`invalid refresh ${JSON.stringify(badBody)} preserves last successful nodes`, async t => {
    let body = 'good.example:443';
    const { worker, advanceTime } = await loadWorker(t, { globals: { fetch: () => new Response(body) } });
    await subscription(worker, env);
    body = badBody; advanceTime(180_000);
    assert.deepEqual(servers(await subscription(worker, env)), ['good.example']);
  });
}

test('cached sources obey current switches, URL changes and request credentials', async t => {
  const fetched = [];
  const { worker } = await loadWorker(t, { globals: { fetch(url) {
    fetched.push(url); return new Response(url === source ? 'first.example:443' : 'other.example:443');
  } } });
  await subscription(worker, env);
  assert.equal((await request(worker, { ...env, egi: 'no' })).status, 503);
  const other = await subscription(worker, { ...env, yxURL: 'https://other.example/list', et: 'yes', ev: 'no', tp: 'changed-password' });
  assert.deepEqual(servers(other), ['other.example']);
  assert.equal(decodeURIComponent(other[0].username), 'changed-password');
  assert.deepEqual(fetched, [source, 'https://other.example/list']);
});

test('built-in source caching applies each request IP-family and ISP filters independently', async t => {
  let calls = 0;
  const { worker } = await loadWorker(t, { globals: {
    crypto: { subtle: { async digest() { return new Uint8Array(16).buffer; } } },
    fetch() { calls++; return Response.json({ data: {
      ctcc: { info: [{ ip: '192.0.2.10' }] }, cmcc: { info: [{ ip: '192.0.2.20' }] },
      ipv6: { info: [{ ip: '2001:db8::1' }] }
    } }); }
  } });
  const settings = { ...env, epi: 'yes', egi: 'no', yxURL: '' };
  assert.deepEqual(servers(await subscription(worker, { ...settings, ipv6: 'no', ispMobile: 'no' })), ['192.0.2.10']);
  assert.deepEqual(servers(await subscription(worker, { ...settings, ipv4: 'no' })), ['[2001:db8::1]']);
  assert.equal(calls, 1);
});

test('source response timing cannot change configured source order or node names', async t => {
  const a = 'https://a.example/list', b = 'https://b.example/list';
  let waiting = new Map();
  const { worker, advanceTime } = await loadWorker(t, { globals: { fetch(url) {
    return new Promise(resolve => waiting.set(url, resolve));
  } } });
  const read = async first => {
    waiting = new Map();
    const pending = subscription(worker, { ...env, yxURL: `${a},${b}` });
    await flush(); assert.equal(waiting.size, 2);
    const last = first === a ? b : a;
    waiting.get(first)(new Response(first === a ? 'one.example:443' : 'two.example:443'));
    await flush();
    waiting.get(last)(new Response(last === a ? 'one.example:443' : 'two.example:443'));
    return (await pending).map(node => [node.hostname, decodeURIComponent(node.hash)]);
  };
  const expected = await read(a);
  advanceTime(180_000);
  assert.deepEqual(await read(b), expected);
  assert.deepEqual(expected, [['one.example', '#优选域名-01'], ['two.example', '#优选域名-02']]);
});

test('preferred source count and fetch concurrency are bounded while preserving order', async t => {
  const urls = Array.from({ length: 20 }, (_, index) => `https://s${index}.example/list`);
  const waiting = new Map();
  const { worker } = await loadWorker(t, { globals: { fetch(url) {
    return new Promise(resolve => waiting.set(url, resolve));
  } } });
  const pending = subscription(worker, { ...env, yxURL: urls.join(',') });
  for (let batch = 0; batch < 4; batch++) {
    await flush(); assert.equal(waiting.size, 4);
    const entries = [...waiting]; waiting.clear();
    for (const [url, resolve] of entries.reverse()) resolve(new Response(`${new URL(url).hostname}:443`));
  }
  assert.deepEqual(servers(await pending), urls.slice(0, 16).map(url => new URL(url).hostname));
});

test('source cache eviction permits new URLs and reloads evicted entries', async t => {
  let calls = 0;
  const { worker } = await loadWorker(t, { globals: { fetch: () => { calls++; return new Response('edge.example:443'); } } });
  for (let index = 0; index < 33; index++) {
    await subscription(worker, { ...env, yxURL: `https://s${index}.example/list` });
  }
  await subscription(worker, { ...env, yxURL: 'https://s0.example/list' });
  assert.equal(calls, 34);
});

test('45,000 valid source nodes produce a bounded usable subscription instead of HTTP 500', async t => {
  const body = Array.from({ length: 45_000 }, (_, index) => `a${index}.test:443`).join('\n');
  assert.ok(Buffer.byteLength(body) < 1024 * 1024);
  const { worker } = await loadWorker(t, { globals: { fetch: () => new Response(body) } });
  const nodes = await subscription(worker, { ...env, et: 'yes', ex: 'yes' });
  assert.equal(nodes.length, 3072);
  assert.equal(new Set(nodes.map(node => node.hostname)).size, 1024);
  assert.ok(nodes.every(node => Number(node.port) === 443));
});

test('large credentials stop node expansion with an explicit compatibility error', async t => {
  const { worker } = await loadWorker(t);
  const yx = Array.from({ length: 1024 }, (_, index) => `a${index}.test:443`).join(',');
  const response = await request(worker, { ...env, yx, ev: 'no', et: 'yes', epd: 'yes', tp: 'x'.repeat(8192) });
  assert.equal(response.status, 422);
  assert.match(await response.text(), /4 MiB/);
});

test('ports excluded by TLS policy do not consume the total budget of a later valid source', async t => {
  const { worker } = await loadWorker(t);
  const yx = Array.from({ length: 1024 }, (_, index) => `198.18.${Math.floor(index / 256)}.${index % 256}:80`)
    .concat('later.example:443').join(',');
  const nodes = await subscription(worker, { ...env, epi: 'yes', epd: 'yes', yx, dkby: 'yes' });
  assert.deepEqual(servers(nodes), ['later.example']);
});
