import assert from 'node:assert/strict';
import test from 'node:test';
import { UUID, environment, loadWorker, mockKV, request, subscription } from './helpers/worker.mjs';
import { isIPAddress } from '../src/preferred.js';

const path = `/${UUID}/api/preferred-ips`;

test('preferred API uses the same effective environment list as subscriptions', async t => {
  const { worker } = await loadWorker(t);
  const env = environment({ C: mockKV(), AE: 'yes', yx: 'example.com:8443' });
  const response = await request(worker, env, path);
  assert.equal(response.status, 200);
  const list = await response.json();
  assert.equal(list.count, 1);
  assert.equal(list.data[0].ip, 'example.com');
  assert.equal(list.data[0].port, 8443);
  assert.ok((await subscription(worker, env)).every(node => node.hostname === 'example.com'));
});

test('KV can disable the preferred API despite an enabled environment setting', async t => {
  const { worker } = await loadWorker(t);
  const env = environment({ C: mockKV({ ae: 'no' }), ae: 'yes', yx: 'example.com:8443' });
  assert.equal((await request(worker, env, path)).status, 403);
});

test('appending through the preferred API preserves the existing environment list', async t => {
  const { worker } = await loadWorker(t);
  const kv = mockKV();
  const env = environment({ C: kv, ae: 'yes', yx: 'example.com:8443' });
  const response = await request(worker, env, path, { method: 'POST',
    body: JSON.stringify({ ip: 'new.example', port: 2053 }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).added, 1);
  const nodes = await subscription(worker, env);
  assert.deepEqual([...new Set(nodes.map(node => node.hostname))], ['example.com', 'new.example']);
  assert.ok(JSON.parse(kv.data.get('c')).yx.includes('example.com:8443'));
});

test('clearing through the preferred API overrides the environment list with an empty KV value', async t => {
  const { worker } = await loadWorker(t);
  const kv = mockKV();
  const env = environment({ C: kv, ae: 'yes', yx: 'example.com:8443' });
  const response = await request(worker, env, path, { method: 'DELETE', body: JSON.stringify({ all: true }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).deletedCount, 1);
  assert.equal(JSON.parse(kv.data.get('c')).yx, '');
  const list = await (await request(worker, env, path)).json();
  assert.equal(list.count, 0);
});

test('preferred API preserves an explicit IPv6 port through save and reload', async t => {
  const { worker } = await loadWorker(t);
  const kv = mockKV({ ae: 'yes' });
  const env = environment({ C: kv, epd: 'no' });
  assert.equal((await request(worker, env, path, { method: 'POST',
    body: JSON.stringify({ ip: '2001:db8::1', port: 8443 }) })).status, 200);
  assert.ok(JSON.parse(kv.data.get('c')).yx.startsWith('[2001:db8::1]:8443#'));
  const nodes = await subscription(worker, env);
  assert.equal(nodes.length, 3);
  assert.ok(nodes.every(node => node.hostname === '[2001:db8::1]' && node.port === '8443'));
});

test('IPv6 validation accepts compressed and mapped addresses without URL suffixes', () => {
  for (const ip of ['::', '::1', '2001:db8::1', '::ffff:192.0.2.1']) assert.equal(isIPAddress(ip), true, ip);
  for (const ip of ['2001:db8::1]/evil', '2001:db8::1]?evil', '2001:db8::1]#evil',
    '[2001:db8::1]', '2001:db8::1%eth0', '2001:db8::1::2']) assert.equal(isIPAddress(ip), false, ip);
});

test('preferred API rejects IPv6 URL suffixes without changing stored nodes', async t => {
  const { worker } = await loadWorker(t);
  const initial = { ae: 'yes', yx: 'saved.example:8443' };
  const C = mockKV(initial);
  const env = environment({ C });
  const response = await request(worker, env, path, { method: 'POST',
    body: JSON.stringify(['2001:db8::1]/evil', '2001:db8::1]?evil', '2001:db8::1]#evil'].map(ip => ({ ip }))) });
  assert.equal(response.status, 400);
  const result = await response.json();
  assert.equal(result.success, false);
  assert.equal(result.added, 0);
  assert.equal(result.errors, 3);
  assert.deepEqual(JSON.parse(C.data.get('c')), initial);
  assert.deepEqual(C.writes, []);
  assert.ok((await subscription(worker, env)).every(node => node.hostname === 'saved.example'));
});

test('preferred API normalizes numeric string ports for duplicate detection and deletion', async t => {
  const { worker } = await loadWorker(t);
  const C = mockKV({ ae: 'yes' });
  const env = environment({ C });
  for (const [port, expectedAdded] of [['8443', 1], ['8443', 0], [8443, 0]]) {
    const result = await (await request(worker, env, path, { method: 'POST',
      body: JSON.stringify({ ip: 'example.com', port }) })).json();
    assert.equal(result.added, expectedAdded);
  }
  const list = await (await request(worker, env, path)).json();
  assert.equal(list.count, 1);
  assert.equal(list.data[0].port, 8443);
  const response = await request(worker, env, path, { method: 'DELETE',
    body: JSON.stringify({ ip: 'example.com', port: '8443' }) });
  assert.equal(response.status, 200);
  assert.equal((await (await request(worker, env, path)).json()).count, 0);
});

test('preferred API rejects invalid ports without altering configuration', async t => {
  const { worker } = await loadWorker(t);
  const initial = { ae: 'yes', yx: 'saved.example:8443' };
  const C = mockKV(initial);
  const env = environment({ C });
  const ports = [0, -1, 65536, 1.5, '8443garbage', '1e3', true, {}];
  const response = await request(worker, env, path, { method: 'POST',
    body: JSON.stringify(ports.map(port => ({ ip: 'example.com', port }))) });
  assert.equal(response.status, 400);
  const result = await response.json();
  assert.equal(result.success, false);
  assert.equal(result.added, 0);
  assert.equal(result.errors, ports.length);
  assert.equal((await request(worker, env, path, { method: 'DELETE',
    body: JSON.stringify({ ip: 'saved.example', port: -1 }) })).status, 400);
  assert.deepEqual(JSON.parse(C.data.get('c')), initial);
  assert.deepEqual(C.writes, []);
});
