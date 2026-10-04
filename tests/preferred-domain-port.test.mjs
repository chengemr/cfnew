import assert from 'node:assert/strict';
import test from 'node:test';
import { UUID, environment, loadWorker, mockKV, nodeFields, request, subscription } from './helpers/worker.mjs';
import { normalizePort, parseAddress } from '../src/preferred.js';

function configured(source, values) {
  return source === 'KV'
    ? environment({ C: mockKV(values) })
    : environment(values);
}

const expectedTLSNodes = (server, port) => [
  { protocol: 'vless', transport: 'ws', server, port, tls: true },
  { protocol: 'trojan', transport: 'ws', server, port, tls: true },
  { protocol: 'vless', transport: 'xhttp', server, port, tls: true }
];

for (const source of ['environment', 'KV']) {
  test(`${source}: all three transports preserve an explicit domain port`, async t => {
    const { worker } = await loadWorker(t);
    const nodes = await subscription(worker, configured(source, { yx: 'example.com:8443#自定义节点' }));
    assert.deepEqual(nodes.map(nodeFields), expectedTLSNodes('example.com', 8443));
  });

  test(`${source}: default ports retain each protocol's existing behavior`, async t => {
    const { worker } = await loadWorker(t);
    const nodes = await subscription(worker, configured(source, { yx: 'example.com', dkby: 'no' }));
    assert.deepEqual(nodes.map(nodeFields), [
      { protocol: 'vless', transport: 'ws', server: 'example.com', port: 443, tls: true },
      { protocol: 'vless', transport: 'ws', server: 'example.com', port: 80, tls: false },
      { protocol: 'trojan', transport: 'ws', server: 'example.com', port: 443, tls: true },
      { protocol: 'trojan', transport: 'ws', server: 'example.com', port: 80, tls: false },
      { protocol: 'vless', transport: 'xhttp', server: 'example.com', port: 443, tls: true }
    ]);
  });

  test(`${source}: TLS-only mode retains the default TLS nodes`, async t => {
    const { worker } = await loadWorker(t);
    const nodes = await subscription(worker, configured(source, { yx: 'example.com' }));
    assert.deepEqual(nodes.map(nodeFields), expectedTLSNodes('example.com', 443));
  });

  test(`${source}: an explicit HTTP port keeps the WS TLS decision`, async t => {
    const { worker } = await loadWorker(t);
    const nodes = await subscription(worker, configured(source, {
      yx: 'example.com:8080', ex: 'no', dkby: 'no'
    }));
    assert.deepEqual(nodes.map(nodeFields), [
      { protocol: 'vless', transport: 'ws', server: 'example.com', port: 8080, tls: false },
      { protocol: 'trojan', transport: 'ws', server: 'example.com', port: 8080, tls: false }
    ]);
  });

  test(`${source}: TLS-only mode filters explicit HTTP domain ports`, async t => {
    const { worker } = await loadWorker(t);
    const nodes = await subscription(worker, configured(source, {
      yx: 'example.com:8080,192.0.2.10:8443', ex: 'no'
    }));
    assert.deepEqual(nodes.map(nodeFields), expectedTLSNodes('192.0.2.10', 8443).slice(0, 2));
  });

  for (const target of ['clash', 'singbox']) {
    test(`${source}: ${target} preserves the explicit server port`, async t => {
      const { worker } = await loadWorker(t);
      const response = await request(worker, configured(source, { yx: 'example.com:8443' }),
        `/${UUID}/sub?target=${target}`);
      assert.equal(response.status, 200);
      const text = await response.text();
      if (target === 'singbox') {
        const nodes = JSON.parse(text).outbounds.filter(node => node.server);
        assert.equal(nodes.length, 3);
        assert.deepEqual(nodes.map(node => [node.server, node.server_port]),
          Array.from({ length: 3 }, () => ['example.com', 8443]));
        assert.deepEqual(nodes.map(node => node.type), ['vless', 'trojan', 'vless']);
      } else {
        // Check node records, excluding DNS ports and policy group sections.
        const proxies = text.split('\nproxies:\n')[1]?.split('\nproxy-groups:\n')[0];
        assert.ok(proxies, 'missing Clash proxy section');
        assert.deepEqual([...proxies.matchAll(/^    server: "([^"]+)"$/gm)].map(match => match[1]),
          ['example.com', 'example.com', 'example.com']);
        assert.deepEqual([...proxies.matchAll(/^    port: (\d+)$/gm)].map(match => Number(match[1])),
          [8443, 8443, 8443]);
      }
    });
  }
}

for (const [address, server, port] of [
  ['192.0.2.10:8443', '192.0.2.10', 8443],
  ['[2001:db8::10]:8443', '2001:db8::10', 8443],
  ['2001:db8::11', '2001:db8::11', 443]
]) {
  test(`${address}: address and port behavior is preserved`, async t => {
    const { worker } = await loadWorker(t);
    const nodes = await subscription(worker, environment({ yx: address }));
    assert.deepEqual(nodes.map(nodeFields), expectedTLSNodes(server, port));
  });
}

test('disabling preferred domains keeps the selected IP nodes', async t => {
  const { worker } = await loadWorker(t);
  const nodes = await subscription(worker, environment({
    yx: 'example.com:8443,192.0.2.10:2053', epd: 'no'
  }));
  assert.deepEqual(nodes.map(nodeFields), expectedTLSNodes('192.0.2.10', 2053));
});

test('disabling all preferred nodes keeps native address nodes', async t => {
  const { worker } = await loadWorker(t);
  const nodes = await subscription(worker, environment({
    yx: 'example.com:8443', yxby: 'yes', ena: 'yes'
  }));
  assert.deepEqual(nodes.map(nodeFields), expectedTLSNodes('worker.example', 443));
});

test('address parsing accepts complete IPv6 and valid port boundaries', () => {
  for (const [value, address, port] of [
    ['example.com:1', 'example.com', 1],
    ['example.com:65535', 'example.com', 65535],
    ['[2001:db8::1]:65535', '2001:db8::1', 65535],
    ['[2001:db8::1]', '2001:db8::1', null],
    ['2001:db8::1', '2001:db8::1', null],
    ['::ffff:192.0.2.1', '::ffff:192.0.2.1', null]
  ]) assert.deepEqual(parseAddress(value), { address, port }, value);
  assert.equal(normalizePort('8443'), 8443);
  for (const value of ['example.com:8443garbage', 'example.com:1.5', 'example.com:0',
    'example.com:65536', '[2001:db8::1]:0', '[2001:db8::1]:65536']) {
    assert.deepEqual(parseAddress(value), { address: value, port: null }, value);
  }
});

for (const source of ['environment', 'KV']) {
  test(`${source}: malformed preferred ports are ignored while valid nodes remain`, async t => {
    const { worker } = await loadWorker(t);
    const nodes = await subscription(worker, configured(source, {
      yx: 'example.com:8443garbage,[2001:db8::1]:65536,example.com:0,valid.example:2053'
    }));
    assert.deepEqual(nodes.map(nodeFields), expectedTLSNodes('valid.example', 2053));
  });
}
