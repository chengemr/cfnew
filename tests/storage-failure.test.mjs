import assert from 'node:assert/strict';
import test from 'node:test';
import { UUID, environment, loadWorker, mockKV, request, subscription } from './helpers/worker.mjs';

const path = `/${UUID}/api/config`;
const post = value => ({ method: 'POST', body: JSON.stringify(value) });

test('invalid KV data cannot be disclosed through an unauthenticated error response', async t => {
  const { worker } = await loadWorker(t);
  const C = mockKV();
  C.data.set('c', 'secret-fixture');
  const response = await request(worker, environment({ C }), '/untrusted');
  assert.equal(response.status, 500);
  const body = await response.text();
  assert.match(body, /KV configuration unavailable/);
  assert.ok(!body.includes('secret'));
  assert.deepEqual(C.writes, []);
});

test('an initial KV read failure cannot overwrite existing configuration', async t => {
  const { worker } = await loadWorker(t);
  const initial = { yx: 'saved.example:8443', alpn: 'h2' };
  const C = mockKV(initial);
  const env = environment({ C });
  const get = C.get.bind(C);
  C.get = async key => {
    if (key === 'c') throw new Error('fixture KV outage');
    return get(key);
  };
  const response = await request(worker, env, path, post({ customDNS: 'https://dns.example/dns-query' }));
  assert.equal(response.status, 500);
  assert.deepEqual(JSON.parse(C.data.get('c')), initial);
  assert.deepEqual(C.writes, []);

  C.get = get;
  assert.equal((await request(worker, env, path, post({ customDNS: 'https://dns.example/dns-query' }))).status, 200);
  assert.deepEqual(JSON.parse(C.data.get('c')), { ...initial, customDNS: 'https://dns.example/dns-query' });
});

test('malformed KV JSON cannot be overwritten by a partial configuration update', async t => {
  const { worker } = await loadWorker(t);
  const C = mockKV();
  C.data.set('c', '{invalid configuration');
  const env = environment({ C });
  assert.equal((await request(worker, env, path, post({ alpn: 'h2' }))).status, 500);
  assert.equal(C.data.get('c'), '{invalid configuration');
  assert.deepEqual(C.writes, []);

  C.data.set('c', JSON.stringify({ yx: 'saved.example:8443' }));
  assert.equal((await request(worker, env, path, post({ alpn: 'h2' }))).status, 200);
  assert.deepEqual(JSON.parse(C.data.get('c')), { yx: 'saved.example:8443', alpn: 'h2' });
});

test('a failed refresh serves the old snapshot but cannot overwrite newer KV data', async t => {
  const { worker, advanceTime } = await loadWorker(t);
  const C = mockKV({ yx: 'old.example:8443', alpn: 'h2' });
  const env = environment({ C });
  assert.ok((await subscription(worker, env)).every(node => node.hostname === 'old.example'));

  const external = { yx: 'new.example:2053', customDNS: 'https://external.example/dns-query' };
  C.data.set('c', JSON.stringify(external));
  C.data.set('c_ver', 'external-change');
  advanceTime(30_000);
  const get = C.get.bind(C);
  C.get = async key => {
    if (key === 'c') throw new Error('fixture refresh outage');
    return get(key);
  };
  assert.ok((await subscription(worker, env)).every(node => node.hostname === 'old.example'));
  assert.equal((await request(worker, env, path, post({ alpn: 'http/1.1' }))).status, 500);
  assert.deepEqual(JSON.parse(C.data.get('c')), external);
  assert.deepEqual(C.writes, []);

  C.get = get;
  assert.equal((await request(worker, env, path, post({ alpn: 'http/1.1' }))).status, 200);
  assert.deepEqual(JSON.parse(C.data.get('c')), { ...external, alpn: 'http/1.1' });
});

test('a failed version-key read still permits saving after a successful full read', async t => {
  const { worker } = await loadWorker(t);
  const C = mockKV({ yx: 'saved.example:8443' });
  const get = C.get.bind(C);
  C.get = async key => {
    if (key === 'c_ver') throw new Error('fixture version-key outage');
    return get(key);
  };
  assert.equal((await request(worker, environment({ C }), path, post({ alpn: 'h2' }))).status, 200);
  assert.deepEqual(JSON.parse(C.data.get('c')), { yx: 'saved.example:8443', alpn: 'h2' });
});

test('an unreadable initial KV configuration cannot reopen UUID management routes', async t => {
  const { worker, advanceTime } = await loadWorker(t);
  const C = mockKV({ d: '/private/path', yx: 'saved.example:8443' });
  const env = environment({ C });
  const get = C.get.bind(C);
  const failingGet = async key => {
    if (key === 'c') throw new Error('fixture configuration outage');
    return get(key);
  };
  C.get = failingGet;
  for (const route of [`/${UUID}`, `/${UUID}/sub`, path, '/private/path']) {
    assert.equal((await request(worker, env, route)).status, 500, route);
  }
  assert.deepEqual(C.writes, []);

  C.get = get;
  assert.equal((await request(worker, env, '/private/path')).status, 200);
  assert.equal((await request(worker, env, `/${UUID}`)).status, 403);
  C.get = failingGet;
  advanceTime(30_000);
  assert.equal((await request(worker, env, '/private/path')).status, 200);
  assert.equal((await request(worker, env, `/${UUID}`)).status, 403);
  assert.equal((await request(worker, env, `/${UUID}/sub`)).status, 403);
  assert.equal((await request(worker, env, path)).status, 404);
});
