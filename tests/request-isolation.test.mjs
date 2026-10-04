import assert from 'node:assert/strict';
import test from 'node:test';
import { parse } from 'yaml';
import { ORIGIN, UUID, environment, loadWorker, mockKV, request, subscription } from './helpers/worker.mjs';
import { deferred } from './helpers/deferred.mjs';
import { flush } from './helpers/transports.mjs';

const configPath = `/${UUID}/api/config`;
const post = value => ({ method: 'POST', body: JSON.stringify(value) });

test('a pending KV read stays bound to its original namespace', async t => {
  const { worker } = await loadWorker(t);
  const started = deferred();
  const gate = deferred();
  const firstKV = mockKV({ yx: 'first.example:8443' });
  const get = firstKV.get.bind(firstKV);
  firstKV.get = async key => {
    if (key === 'c_ver') { started.resolve(); await gate.promise; }
    return get(key);
  };
  const pending = subscription(worker, environment({ C: firstKV }));
  await started.promise;
  await subscription(worker, environment({ C: mockKV({ yx: 'second.example:2053' }) }));
  gate.resolve();
  const nodes = await pending;
  assert.ok(nodes.every(node => node.hostname === 'first.example' && node.port === '8443'));
});

test('subscriptions retain protocol, DNS and ECH settings while awaiting a source', async t => {
  const started = deferred();
  const gate = deferred();
  const { worker } = await loadWorker(t, { globals: { async fetch(url) {
    assert.equal(url, 'https://preferred.example/list');
    started.resolve();
    await gate.promise;
    return new Response('first.example:8443#fixture');
  } } });
  const first = environment({ epd: 'no', epi: 'no', egi: 'yes', yxURL: 'https://preferred.example/list',
    ev: 'yes', et: 'no', ex: 'no', ech: 'yes', alpn: 'h2',
    customDNS: 'https://first.dns.example/dns-query', customECHDomain: 'first.ech.example' });
  const pending = request(worker, first, `/${UUID}/sub?target=clash`);
  await started.promise;
  await subscription(worker, environment({ yx: 'second.example:2053', ev: 'no', et: 'yes', ex: 'no' }));
  gate.resolve();
  const response = await pending;
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-ECH-Status'), 'ENABLED');
  const config = parse(await response.text());
  assert.equal(config.dns.nameserver[0], 'https://first.dns.example/dns-query');
  assert.equal(config.proxies.length, 1);
  assert.equal(config.proxies[0].type, 'vless');
  assert.equal(config.proxies[0].server, 'first.example');
  assert.deepEqual(config.proxies[0].alpn, ['h2']);
  assert.equal(config.proxies[0]['ech-opts']['query-server-name'], 'first.ech.example');
});

test('a pending configuration POST cannot write to another KV namespace', async t => {
  const { worker } = await loadWorker(t);
  const firstKV = mockKV({ yx: 'first.example:8443' });
  const secondKV = mockKV({ yx: 'second.example:2053' });
  const started = deferred();
  const gate = deferred();
  const input = new Request(ORIGIN + configPath, post({ yx: 'changed.example:443' }));
  input.json = async () => { started.resolve(); return gate.promise; };
  const pending = worker.fetch(input, environment({ C: firstKV }));
  await started.promise;
  await subscription(worker, environment({ C: secondKV }));
  gate.resolve({ yx: 'changed.example:443' });
  assert.equal((await pending).status, 200);
  assert.equal(JSON.parse(firstKV.data.get('c')).yx, 'changed.example:443');
  assert.equal(JSON.parse(secondKV.data.get('c')).yx, 'second.example:2053');
  assert.deepEqual(secondKV.writes, []);
});

test('a failed configuration write leaves the last saved snapshot visible', async t => {
  const { worker } = await loadWorker(t);
  const kv = mockKV({ yx: 'saved.example:8443' });
  kv.put = async () => { throw new Error('fixture write failure'); };
  const env = environment({ C: kv });
  assert.equal((await request(worker, env, configPath, post({ yx: 'unsaved.example:443' }))).status, 500);
  const config = await (await request(worker, env, configPath)).json();
  assert.equal(config.yx, 'saved.example:8443');
});

test('overlapping configuration writes retain both changes in KV', async t => {
  const { worker } = await loadWorker(t);
  const kv = mockKV({ yx: 'saved.example:8443' });
  const started = deferred();
  const gate = deferred();
  const put = kv.put.bind(kv);
  let writes = 0;
  kv.put = async (key, value) => {
    if (key === 'c' && ++writes === 1) { started.resolve(); await gate.promise; }
    return put(key, value);
  };
  const env = environment({ C: kv });
  const first = request(worker, env, configPath, post({ yx: 'changed.example:443' }));
  await started.promise;
  const second = request(worker, env, configPath, post({ customDNS: 'https://dns.example/dns-query' }));
  await flush();
  gate.resolve();
  const responses = await Promise.all([first, second]);
  assert.ok(responses.every(response => response.status === 200));
  const config = JSON.parse(kv.data.get('c'));
  assert.equal(config.yx, 'changed.example:443');
  assert.equal(config.customDNS, 'https://dns.example/dns-query');
});

test('configuration writes at the same clock tick get different cache versions', async t => {
  const { worker } = await loadWorker(t);
  const kv = mockKV();
  const env = environment({ C: kv });
  await request(worker, env, configPath, post({ yx: 'first.example:8443' }));
  const first = kv.data.get('c_ver');
  await request(worker, env, configPath, post({ yx: 'second.example:2053' }));
  assert.notEqual(kv.data.get('c_ver'), first);
});

test('concurrent cache misses share one complete KV read', async t => {
  const { worker } = await loadWorker(t);
  const kv = mockKV({ yx: 'example.com:8443' });
  const env = environment({ C: kv });
  await Promise.all(Array.from({ length: 8 }, () => subscription(worker, env)));
  assert.deepEqual(kv.reads, ['c_ver', 'c']);
});

test('periodic full refresh recovers when a version write fails', async t => {
  const reader = await loadWorker(t);
  const writer = await loadWorker(t);
  const kv = mockKV({ yx: 'saved.example:8443' });
  const env = environment({ C: kv });
  await subscription(reader.worker, env);
  const put = kv.put.bind(kv);
  kv.put = async (key, value) => {
    if (key === 'c_ver') throw new Error('fixture version failure');
    return put(key, value);
  };
  assert.equal((await request(writer.worker, env, configPath, post({ yx: 'changed.example:443' }))).status, 200);
  reader.advanceTime(5 * 60_000);
  assert.ok((await subscription(reader.worker, env)).every(node => node.hostname === 'changed.example'));
});

test('concurrent preferred additions merge against the latest saved list', async t => {
  const { worker } = await loadWorker(t);
  const kv = mockKV({ ae: 'yes', yx: 'saved.example:8443' });
  const env = environment({ C: kv });
  const path = `/${UUID}/api/preferred-ips`;
  const responses = await Promise.all(['first.example', 'second.example'].map(ip =>
    request(worker, env, path, post({ ip, port: 2053 }))));
  assert.ok(responses.every(response => response.status === 200));
  const nodes = await subscription(worker, env);
  assert.deepEqual([...new Set(nodes.map(node => node.hostname))],
    ['saved.example', 'first.example', 'second.example']);
});

test('a rejected KV write does not block a subsequent save', async t => {
  const { worker } = await loadWorker(t);
  const kv = mockKV({ yx: 'saved.example:8443' });
  const env = environment({ C: kv });
  const put = kv.put.bind(kv);
  kv.put = async () => { throw new Error('fixture write failure'); };
  assert.equal((await request(worker, env, configPath, post({ yx: 'failed.example:443' }))).status, 500);
  kv.put = put;
  assert.equal((await request(worker, env, configPath, post({ customDNS: 'https://dns.example/dns-query' }))).status, 200);
  const config = JSON.parse(kv.data.get('c'));
  assert.equal(config.yx, 'saved.example:8443');
  assert.equal(config.customDNS, 'https://dns.example/dns-query');
});
