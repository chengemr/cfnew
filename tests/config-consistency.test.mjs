import assert from 'node:assert/strict';
import test from 'node:test';
import { UUID, environment, loadWorker, mockKV, nodeFields, request, subscription } from './helpers/worker.mjs';

for (const source of ['environment', 'KV']) {
  test(`${source}: TLS-only switches share normalized API and subscription behavior`, async t => {
    const { worker } = await loadWorker(t);
    const values = { dkby: 'YES', yx: 'example.com' };
    const env = source === 'KV'
      ? environment({ C: mockKV(values) })
      : environment({ ...values, C: mockKV() });
    const configuration = await (await request(worker, env, `/${UUID}/api/config`)).json();
    assert.equal(configuration.dkby, 'yes');
    const nodes = await subscription(worker, env);
    assert.equal(nodes.length, 3);
    assert.ok(nodes.every(node => node.searchParams.get('security') === 'tls'));
  });
}

test('uppercase protocol aliases match the configuration API snapshot', async t => {
  const { worker } = await loadWorker(t);
  const env = environment({ ev: undefined, et: undefined, ex: undefined,
    EV: 'no', ET: 'yes', EX: 'yes', yx: 'example.com:8443', C: mockKV() });
  const configuration = await (await request(worker, env, `/${UUID}/api/config`)).json();
  assert.deepEqual([configuration.ev, configuration.et, configuration.ex], ['no', 'yes', 'yes']);
  const nodes = await subscription(worker, env);
  assert.deepEqual(nodes.map(nodeFields).map(node => [node.protocol, node.transport]),
    [['trojan', 'ws'], ['vless', 'xhttp']]);
});

test('custom DNS and ECH environment aliases reach generated nodes', async t => {
  const { worker } = await loadWorker(t);
  const nodes = await subscription(worker, environment({ yx: 'example.com:8443', ech: 'yes',
    CUSTOM_DNS: 'https://dns.example/dns-query', CUSTOM_ECH_DOMAIN: 'ech.example' }));
  assert.ok(nodes.every(node => node.searchParams.get('ech') === 'ech.example+https://dns.example/dns-query'));
});

test('reading an ECH subscription does not write KV configuration', async t => {
  const { worker } = await loadWorker(t);
  const kv = mockKV({ ech: 'yes', yx: 'example.com:8443' });
  const nodes = await subscription(worker, environment({ C: kv }));
  assert.equal(nodes.length, 3);
  assert.deepEqual(kv.writes, []);
});

test('ECH TLS filtering does not remain after ECH is disabled without KV', async t => {
  const { worker } = await loadWorker(t);
  const env = environment({ yx: 'example.com', dkby: 'no' });
  await subscription(worker, { ...env, ech: 'yes' });
  const nodes = await subscription(worker, { ...env, ech: 'no' });
  assert.deepEqual(nodes.map(node => node.port), ['443', '80', '443', '80', '443']);
});

for (const suffix of ['', '/sub', '/api/config', '/api/preferred-ips', '/region', '/test-api']) {
  test(`KV overrides the environment management path: ${suffix || 'page'}`, async t => {
    const { worker } = await loadWorker(t);
    const env = environment({ d: '/old/path', C: mockKV({ d: '/new/path', ae: 'yes', yx: 'example.com:8443' }) });
    assert.equal((await request(worker, env, '/new/path' + suffix)).status, 200);
    assert.equal((await request(worker, env, '/old/path' + suffix)).status, 404);
  });
}

for (const suffix of ['/api/config', '/api/preferred-ips']) {
  test(`a management path containing api supports ${suffix}`, async t => {
    const { worker } = await loadWorker(t);
    const env = environment({ d: '/path/api/admin', C: mockKV({ ae: 'yes' }) });
    assert.equal((await request(worker, env, '/path/api/admin' + suffix)).status, 200);
  });
}

test('UUID routes reject arbitrary suffixes instead of generating subscriptions', async t => {
  const { worker } = await loadWorker(t);
  const env = environment({ yx: 'example.com:8443' });
  for (const path of [`/${UUID}-extra`, `/${UUID}/unknown`, `/${UUID}/sub-extra`, `/${UUID}/api/config-extra`]) {
    assert.equal((await request(worker, env, path)).status, 404, path);
  }
});

test('changing a KV binding invalidates the cached configuration', async t => {
  const { worker } = await loadWorker(t);
  await subscription(worker, environment({ C: mockKV({ yx: 'old.example:8443' }) }));
  const nodes = await subscription(worker, environment({ C: mockKV({ yx: 'new.example:2053' }) }));
  assert.ok(nodes.every(node => node.hostname === 'new.example' && node.port === '2053'));
});

test('removing a KV binding restores environment settings and disables the API', async t => {
  const { worker } = await loadWorker(t);
  await subscription(worker, environment({ C: mockKV({ yx: 'old.example:8443' }) }));
  const env = environment({ yx: 'new.example:2053' });
  assert.ok((await subscription(worker, env)).every(node => node.hostname === 'new.example'));
  assert.equal((await request(worker, env, `/${UUID}/api/config`)).status, 503);
});
