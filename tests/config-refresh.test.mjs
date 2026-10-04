import assert from 'node:assert/strict';
import test from 'node:test';
import { UUID, environment, loadWorker, mockKV, request, subscription } from './helpers/worker.mjs';

const retired = 'retired.example';
const retiredConfig = { yx: `${retired}:8443`, epi: 'no', egi: 'no' };
const hasServer = (nodes, server) => nodes.some(node => node.hostname === server);

function assertDefaultDomains(nodes) {
  assert.ok(nodes.length > 0);
  assert.ok(!hasServer(nodes, retired), 'removed domain is still in the subscription');
  assert.ok(!hasServer(nodes, '127.0.0.1'), 'stale custom lists prevented default domain selection');
}

test('another isolate clearing yx becomes visible after the existing cache window', async t => {
  const reader = await loadWorker(t);
  const writer = await loadWorker(t);
  const C = mockKV(retiredConfig);
  const env = environment({ C, epi: 'no' });
  assert.ok(hasServer(await subscription(reader.worker, env), retired));

  const response = await request(writer.worker, env, `/${UUID}/api/config`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ yx: '' })
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
  assert.equal(JSON.parse(C.data.get('c')).yx, undefined);

  reader.advanceTime(29_000);
  assert.ok(hasServer(await subscription(reader.worker, env), retired), 'short cache behavior changed');
  const readsBeforeRefresh = C.reads.length;
  reader.advanceTime(1000);
  assertDefaultDomains(await subscription(reader.worker, env));
  assert.deepEqual(C.reads.slice(readsBeforeRefresh), ['c_ver', 'c']);
});

test('clearing an old IP list permits the default domain list again', async t => {
  const { worker, advanceTime } = await loadWorker(t);
  const C = mockKV({ yx: '192.0.2.10:8443', egi: 'no' });
  const env = environment({ C });
  assert.ok(hasServer(await subscription(worker, env), '192.0.2.10'));
  C.data.set('c', JSON.stringify({ epi: 'no', egi: 'no' }));
  C.data.set('c_ver', '2');
  advanceTime(30_000);
  const nodes = await subscription(worker, env);
  assertDefaultDomains(nodes);
  assert.ok(!hasServer(nodes, '192.0.2.10'));
});

test('a successful refresh of a deleted c key clears the previous snapshot', async t => {
  const { worker, advanceTime } = await loadWorker(t);
  const C = mockKV(retiredConfig);
  const env = environment({ C, epi: 'no' });
  assert.ok(hasServer(await subscription(worker, env), retired));
  C.data.delete('c');
  C.data.set('c_ver', '2');
  advanceTime(30_000);
  assertDefaultDomains(await subscription(worker, env));
});

test('removing the KV override restores an environment preferred list', async t => {
  const { worker, advanceTime } = await loadWorker(t);
  const C = mockKV(retiredConfig);
  const env = environment({ C, epi: 'no', yx: 'environment.example:2053' });
  assert.ok(hasServer(await subscription(worker, env), retired));
  C.data.set('c', JSON.stringify({ epi: 'no', egi: 'no' }));
  C.data.set('c_ver', '2');
  advanceTime(30_000);
  const nodes = await subscription(worker, env);
  assert.equal(nodes.length, 3);
  assert.ok(nodes.every(node => node.hostname === 'environment.example' && node.port === '2053'));
});

test('replacing a preferred list removes both old IP and domain entries', async t => {
  const { worker, advanceTime } = await loadWorker(t);
  const C = mockKV({ yx: `${retired}:8443,192.0.2.10:8443` });
  const env = environment({ C });
  const before = await subscription(worker, env);
  assert.ok(hasServer(before, retired));
  assert.ok(hasServer(before, '192.0.2.10'));
  C.data.set('c', JSON.stringify({ yx: 'replacement.example:2053' }));
  C.data.set('c_ver', '2');
  advanceTime(30_000);
  const after = await subscription(worker, env);
  assert.equal(after.length, 3);
  assert.ok(after.every(node => node.hostname === 'replacement.example' && node.port === '2053'));
});

test('temporary KV read errors retain the last good snapshot and allow retry', async t => {
  const { worker, advanceTime } = await loadWorker(t);
  const C = mockKV(retiredConfig);
  const env = environment({ C, epi: 'no' });
  assert.ok(hasServer(await subscription(worker, env), retired));
  C.data.set('c', JSON.stringify({ yx: 'replacement.example:2053', epi: 'no' }));
  C.data.set('c_ver', '2');
  advanceTime(30_000);
  const get = C.get.bind(C);
  C.get = async key => {
    if (key === 'c') throw new Error('Temporary KV read failure');
    return get(key);
  };
  assert.ok(hasServer(await subscription(worker, env), retired));
  C.get = get;
  assert.ok(hasServer(await subscription(worker, env), 'replacement.example'));
});

test('malformed KV JSON retains the last good snapshot and allows retry', async t => {
  const { worker, advanceTime } = await loadWorker(t);
  const C = mockKV(retiredConfig);
  const env = environment({ C, epi: 'no' });
  assert.ok(hasServer(await subscription(worker, env), retired));
  C.data.set('c', '{invalid json');
  C.data.set('c_ver', '2');
  advanceTime(30_000);
  assert.ok(hasServer(await subscription(worker, env), retired));
  C.data.set('c', JSON.stringify({ yx: 'replacement.example:2053', epi: 'no' }));
  assert.ok(hasServer(await subscription(worker, env), 'replacement.example'));
});
