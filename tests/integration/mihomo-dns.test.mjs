import assert from 'node:assert/strict';
import test from 'node:test';
import { createSocket } from 'node:dgram';
import { createServer, get } from 'node:http';
import { createServer as tcpServer, connect } from 'node:net';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { parse, stringify } from 'yaml';
import { UUID, environment, loadWorker, request } from '../helpers/worker.mjs';

const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z9WQAAAAASUVORK5CYII=', 'base64');

async function dnsFixture(t, respond) {
  const server = createSocket('udp4');
  const queries = [];
  server.on('message', (packet, remote) => {
    queries.push(packet);
    if (!respond) return; // Simulate the unavailable fallback resolver.
    let end = 12;
    while (packet[end]) end += packet[end] + 1;
    const type = packet.readUInt16BE(end + 1);
    end += 5;
    const header = Buffer.from(packet.subarray(0, 12));
    header.writeUInt16BE(0x8180, 2);
    header.writeUInt16BE(type === 1 ? 1 : 0, 6);
    header.writeUInt32BE(0, 8);
    const answer = type === 1 ? Buffer.from([0xc0, 0x0c, 0, 1, 0, 1, 0, 0, 0, 60, 0, 4, 127, 0, 0, 1]) : Buffer.alloc(0);
    server.send(Buffer.concat([header, packet.subarray(12, end), answer]), remote.port, remote.address);
  });
  server.bind(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  return { address: `127.0.0.1:${server.address().port}`, queries };
}

async function freePort() {
  const server = tcpServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function startCore(t, config) {
  const binary = process.env.CFNEW_MIHOMO_BIN;
  assert.ok(binary, 'Set CFNEW_MIHOMO_BIN to an installed Mihomo binary');
  const directory = await mkdtemp(join(tmpdir(), 'cfnew-mihomo-'));
  const port = await freePort();
  // A listening mixed port can precede compatible provider initialization.
  // Require the controller to expose the generated groups and their choices.
  const controllerAddress = config['external-controller'] || '127.0.0.1:0';
  const controllerPort = Number(controllerAddress.split(':').at(-1)) || await freePort();
  config['external-controller'] = `127.0.0.1:${controllerPort}`;
  config['mixed-port'] = port;
  await writeFile(join(directory, 'config.yaml'), stringify(config));
  const child = spawn(resolve(binary), ['-d', directory, '-f', join(directory, 'config.yaml')]);
  let log = '';
  child.stdout.on('data', chunk => { log += chunk; });
  child.stderr.on('data', chunk => { log += chunk; });
  const closed = once(child, 'close');
  t.after(async () => {
    child.kill('SIGTERM');
    const killTimer = setTimeout(() => child.kill('SIGKILL'), 1000);
    try { await closed; } finally { clearTimeout(killTimer); await rm(directory, { recursive: true, force: true }); }
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(log);
    const ready = await new Promise(resolve => {
      const socket = connect({ host: '127.0.0.1', port });
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => resolve(false));
    });
    if (ready) {
      const proxies = await new Promise(resolve => {
        const req = get(`http://127.0.0.1:${controllerPort}/proxies`, response => {
          let body = '';
          response.on('data', chunk => { body += chunk; });
          response.on('end', () => {
            try { resolve(JSON.parse(body).proxies); } catch { resolve(null); }
          });
          response.on('error', () => resolve(null));
        });
        req.on('error', () => resolve(null));
        req.setTimeout(500, () => { req.destroy(); resolve(null); });
      });
      const groupsReady = (config['proxy-groups'] || []).every(group => {
        const active = proxies?.[group.name];
        return active && group.proxies.every(name => active.all?.includes(name))
          && (!group.proxies.length || active.all.includes(active.now));
      });
      if (proxies && groupsReady) return port;
    }
    await delay(20);
  }
  throw new Error(`Mihomo did not start: ${log}`);
}

function fetchImage(proxyPort, imagePort) {
  return new Promise((resolve, reject) => {
    const req = get({ host: '127.0.0.1', port: proxyPort,
      path: `http://i0.hdslb.com:${imagePort}/probe.png`, headers: { Host: `i0.hdslb.com:${imagePort}` }
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks) }));
      response.on('error', reject);
    });
    req.setTimeout(2500, () => req.destroy(new Error('image request timed out')));
    req.on('error', reject);
  });
}

test('Mihomo image requests bypass unavailable fallback only with the generated CDN policy', async t => {
  const main = await dnsFixture(t, true);
  const fallback = await dnsFixture(t, false);
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(image);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const { worker } = await loadWorker(t);
  const response = await request(worker, environment({ yx: 'example.com:8443' }), `/${UUID}/sub?target=clash`);
  const generated = parse(await response.text());
  assert.ok(generated.dns['nameserver-policy']['+.hdslb.com'], 'missing generated CDN policy');
  // Keep generated nodes, groups and the CDN rule. Replace remote DNS addresses
  // with loopback fixtures and omit external rule/GeoIP downloads for isolation.
  const config = { ...generated, 'external-controller': '127.0.0.1:0', 'geo-auto-update': false,
    dns: { ...generated.dns, listen: '127.0.0.1:0', 'default-nameserver': ['127.0.0.1'],
      nameserver: [main.address], fallback: [fallback.address],
      'proxy-server-nameserver': [main.address],
      'fallback-filter': { geoip: false, ipcidr: ['127.0.0.0/8'] }
    },
    rules: generated.rules.filter(rule => rule.startsWith('DOMAIN-SUFFIX,hdslb.com,')).concat('MATCH,DIRECT')
  };
  delete config['rule-providers'];
  delete config['geox-url'];
  delete config.dns['nameserver-policy'];
  await t.test('without policy the healthy main answer is discarded and the image fails', async t => {
    const port = await startCore(t, config);
    const result = await fetchImage(port, server.address().port).catch(() => null);
    assert.ok(!result || result.status !== 200);
    assert.ok(main.queries.length > 0);
    assert.ok(fallback.queries.length > 0);
  });
  const previousFallbackQueries = fallback.queries.length;
  await t.test('with policy the image loads and fallback receives no query', async t => {
    config.dns['nameserver-policy'] = { '+.hdslb.com': [main.address] };
    const port = await startCore(t, config);
    const result = await fetchImage(port, server.address().port);
    assert.equal(result.status, 200, result.body.toString());
    assert.deepEqual(result.body, image);
    assert.equal(fallback.queries.length, previousFallbackQueries);
  });
});

test('Mihomo resolves a proxy domain despite an unavailable website fallback', async t => {
  const main = await dnsFixture(t, true);
  const fallback = await dnsFixture(t, false);
  const sockets = new Set();
  let requests = 0;
  const origin = createServer((req, res) => {
    requests++;
    res.writeHead(204);
    res.end();
  });
  origin.listen(0, '127.0.0.1');
  await once(origin, 'listening');
  const proxy = createServer();
  proxy.on('connection', socket => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  proxy.on('connect', (req, downstream, head) => {
    const upstream = connect({ host: '127.0.0.1', port: origin.address().port });
    sockets.add(upstream);
    upstream.once('close', () => sockets.delete(upstream));
    upstream.once('error', () => downstream.destroy());
    downstream.once('error', () => upstream.destroy());
    downstream.once('close', () => upstream.destroy());
    upstream.once('connect', () => {
      downstream.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      downstream.pipe(upstream).pipe(downstream);
    });
  });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await Promise.all([origin, proxy].map(server => new Promise(resolve => server.close(resolve))));
  });

  const { worker } = await loadWorker(t);
  const response = await request(worker, environment({ yx: 'example.com:8443' }), `/${UUID}/sub?target=clash`);
  const generated = parse(await response.text());
  assert.ok(generated.dns['proxy-server-nameserver']?.length, 'missing generated proxy DNS');

  // A loopback filter stands in for an overseas main answer rejected by GeoIP.
  // Every DNS endpoint and both HTTP endpoints are local; no VPS is contacted.
  async function probe(subtest, dedicated) {
    const apiPort = await freePort();
    const dns = { ...generated.dns, listen: '127.0.0.1:0', ipv6: false,
      'default-nameserver': ['127.0.0.1'], 'nameserver-policy': {},
      nameserver: [main.address], fallback: [fallback.address],
      'fallback-filter': { geoip: false, ipcidr: ['127.0.0.0/8'] }
    };
    if (dedicated) {
      dns['proxy-server-nameserver'] = generated.dns['proxy-server-nameserver'].map(() => main.address);
    } else {
      delete dns['proxy-server-nameserver'];
    }
    await startCore(subtest, {
      'external-controller': `127.0.0.1:${apiPort}`, 'log-level': 'error',
      mode: 'rule', ipv6: false, 'unified-delay': false, dns,
      proxies: [{ name: 'domain-node', type: 'http', server: 'bootstrap-node.invalid', port: proxy.address().port }],
      rules: ['MATCH,DIRECT']
    });
    const query = new URLSearchParams({ url: `http://fixture.invalid:${origin.address().port}/generate_204`, timeout: '1500' });
    const result = await fetch(`http://127.0.0.1:${apiPort}/proxies/domain-node/delay?${query}`, {
      signal: AbortSignal.timeout(5000)
    });
    return { status: result.status, body: await result.json() };
  }

  await t.test('without dedicated proxy DNS the node never reaches the HTTP origin', async subtest => {
    const result = await probe(subtest, false);
    assert.notEqual(result.status, 200);
    assert.equal(requests, 0);
    assert.ok(main.queries.length > 0);
    assert.ok(fallback.queries.length > 0);
  });
  const previousFallbackQueries = fallback.queries.length;
  await t.test('with generated proxy DNS the node connects without querying fallback', async subtest => {
    const result = await probe(subtest, true);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.ok(Number.isInteger(result.body.delay));
    assert.ok(requests > 0);
    assert.equal(fallback.queries.length, previousFallbackQueries);
  });
});
