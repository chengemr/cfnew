import assert from 'node:assert/strict';
import test from 'node:test';
import { UUID, environment, loadWorker, mockKV, request, subscription } from './helpers/worker.mjs';

const paths = [
  { value: '/path/to/sub', base: '/path/to/sub' },
  { value: 'path/to/sub', base: '/path/to/sub' },
  { value: '/path/to/sub/', base: '/path/to/sub' }
];

function configured(source, d) {
  const values = { d, yx: 'example.com:8443' };
  return source === 'KV'
    ? environment({ C: mockKV({ ...values, ae: 'yes' }) })
    : environment({ ...values, C: mockKV({ ae: 'yes' }) });
}

for (const source of ['environment', 'KV']) {
  for (const { value, base } of paths) {
    for (const suffix of ['', '/sub', '/api/config', '/api/preferred-ips', '/region', '/test-api']) {
      test(`${source} d=${value}: ${suffix || 'management page'}`, async t => {
        const { worker } = await loadWorker(t);
        const env = configured(source, value);
        if (suffix === '/sub') {
          const nodes = await subscription(worker, env, base + suffix);
          assert.equal(nodes.length, 3);
          assert.ok(nodes.every(node => node.hostname === 'example.com' && node.port === '8443'));
          return;
        }
        const response = await request(worker, env, base + suffix);
        assert.equal(response.status, 200);
        if (!suffix) {
          assert.match(response.headers.get('content-type'), /^text\/html/);
        } else {
          assert.match(response.headers.get('content-type'), /^application\/json/);
          const data = await response.json();
          if (suffix === '/api/config') {
            assert.equal(data.d, value);
            assert.equal(data.kvEnabled, true);
          } else if (suffix === '/api/preferred-ips') {
            assert.equal(data.success, true);
          } else if (suffix === '/region') {
            assert.equal(data.region, 'CF');
          } else {
            assert.equal(data.detectedRegion, 'CF');
          }
        }
      });
    }
  }

  test(`${source}: reject sibling prefixes, parent paths and unknown suffixes`, async t => {
    const { worker } = await loadWorker(t);
    const env = configured(source, 'path/to/sub');
    for (const path of ['/path/to/sub-other', '/path/to', '/path/to/sub/unknown', '/path/to/sub/sub-extra']) {
      const response = await request(worker, env, path);
      assert.equal(response.status, 404, path);
    }
    const uuidResponse = await request(worker, env, `/${UUID}/sub`);
    assert.equal(uuidResponse.status, 403, 'UUID subscriptions must remain disabled in custom-path mode');
  });

  test(`${source}: multi-level configuration POST persists the change`, async t => {
    const { worker } = await loadWorker(t);
    const env = configured(source, '/path/to/sub/');
    const response = await request(worker, env, '/path/to/sub/api/config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alpn: 'h2' })
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).success, true);
    assert.equal(JSON.parse(env.C.data.get('c')).alpn, 'h2');
  });
}

for (const d of ['mypath', '/mypath', '/My/Path']) {
  test(`${d}: retain single-level paths and case-sensitive custom paths`, async t => {
    const { worker } = await loadWorker(t);
    const base = '/' + d.replace(/^\//, '');
    const response = await request(worker, configured('environment', d), base);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /^text\/html/);
    const nodes = await subscription(worker, configured('environment', d), base + '/sub');
    assert.equal(nodes.length, 3);
    const wrongCase = await request(worker, configured('environment', d), base.toUpperCase() + '/sub');
    assert.equal(wrongCase.status, 404, 'custom paths must remain case-sensitive');
  });
}

test('uppercase D environment alias supports multi-level paths', async t => {
  const { worker } = await loadWorker(t);
  const nodes = await subscription(worker, environment({
    D: '/path/to/sub', yx: 'example.com:8443'
  }), '/path/to/sub/sub');
  assert.equal(nodes.length, 3);
});

test('UUID routes retain management, subscription and status behavior', async t => {
  const { worker } = await loadWorker(t);
  const env = environment({ yx: 'example.com:8443', C: mockKV({ ae: 'yes' }) });
  for (const suffix of ['', '/sub', '/api/config', '/api/preferred-ips', '/region', '/test-api']) {
    const response = await request(worker, env, `/${UUID}${suffix}`);
    assert.equal(response.status, 200, suffix);
    if (suffix === '/region') assert.equal((await response.json()).region, 'CF');
    if (suffix === '/test-api') assert.equal((await response.json()).detectedRegion, 'CF');
  }
});

test('invalid path prefixes are rejected after resolving KV path overrides', async t => {
  const { worker } = await loadWorker(t);
  const env = configured('environment', '/path/to/sub');
  const response = await request(worker, env, '/path/to/sub-other/api/config');
  assert.equal(response.status, 404);
  assert.deepEqual(env.C.reads, ['c_ver', 'c']);
});
