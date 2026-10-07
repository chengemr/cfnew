import assert from 'node:assert/strict';
import test from 'node:test';
import { parse } from 'yaml';
import { parseShareLink } from '../src/subscriptions/links.js';
import { UUID, environment, loadWorker, request, subscription } from './helpers/worker.mjs';

const trojanOnly = { ev: 'no', et: 'yes', ex: 'no' };
const plainTrojan = { ...trojanOnly, yx: 'edge.example:8080', dkby: 'no' };

function localNodes(target, text) {
  const section = target === 'quanx' ? 'server_local' : 'Proxy';
  return text.split(`[${section}]`)[1].split(/\n\[/)[0].trim().split('\n');
}

async function compatibilityFailure(worker, env, target, message) {
  const response = await request(worker, env, `/${UUID}/sub?target=${target}`);
  assert.equal(response.status, 422, await response.clone().text());
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.match(response.headers.get('Content-Type'), /^text\/plain/);
  assert.match(await response.text(), message);
}

test('Trojan share links keep implicit TLS and honor explicit security=none', () => {
  const link = `trojan://${UUID}@edge.example:8080?type=ws`;
  assert.equal(parseShareLink(link).tls, true);
  assert.equal(parseShareLink(link + '&security=tls').tls, true);
  assert.equal(parseShareLink(link + '&security=none').tls, false);
});

test('Sing-box preserves plaintext Trojan WS without enabling TLS', async t => {
  const { worker } = await loadWorker(t);
  const env = environment(plainTrojan);
  const raw = await subscription(worker, env);
  assert.equal(raw.length, 1);
  assert.equal(raw[0].searchParams.get('security'), 'none');
  const response = await request(worker, env, `/${UUID}/sub?target=singbox`);
  assert.equal(response.status, 200);
  const nodes = JSON.parse(await response.text()).outbounds.filter(node => node.type === 'trojan');
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].server_port, 8080);
  assert.equal(nodes[0].transport.type, 'ws');
  assert.equal(nodes[0].tls, undefined);
});

for (const target of ['clash', 'clashr', 'stash', 'meta', 'clashmeta', 'surge', 'loon', 'quanx']) {
  test(`${target}: plaintext Trojan-only subscriptions reject instead of enabling TLS`, async t => {
    const { worker } = await loadWorker(t);
    await compatibilityFailure(worker, environment(plainTrojan), target, /兼容的节点.*TLS Trojan/);
  });
}

test('Clash keeps compatible plaintext VLESS and removes plaintext Trojan references', async t => {
  const { worker } = await loadWorker(t);
  const response = await request(worker, environment({ ...plainTrojan, ev: 'yes' }),
    `/${UUID}/sub?target=clash`);
  assert.equal(response.status, 200);
  const config = parse(await response.text());
  assert.equal(config.proxies.length, 1);
  const node = config.proxies[0];
  assert.equal(node.type, 'vless');
  assert.equal(node.tls, false);
  assert.equal(node.port, 8080);
  const known = new Set(['DIRECT', 'REJECT', node.name, ...config['proxy-groups'].map(group => group.name)]);
  for (const group of config['proxy-groups']) {
    assert.ok(group.proxies.every(name => known.has(name)), group.name);
  }
});

for (const target of ['surge', 'loon', 'quanx']) {
  test(`${target}: filtering plaintext Trojan retains an available TLS Trojan`, async t => {
    const { worker } = await loadWorker(t);
    const response = await request(worker, environment({ ...trojanOnly, yx: 'edge.example', dkby: 'no' }),
      `/${UUID}/sub?target=${target}`);
    assert.equal(response.status, 200);
    const nodes = localNodes(target, await response.text());
    assert.equal(nodes.length, 1);
    assert.match(nodes[0], /trojan/);
    assert.match(nodes[0], /edge\.example(?::|,\s*)443/);
  });
}

for (const target of ['surge', 'surge2', 'surge3', 'surge4']) {
  test(`${target}: VLESS-only subscriptions reject instead of exporting direct-only profiles`, async t => {
    const { worker } = await loadWorker(t);
    const env = environment({ yx: 'edge.example:8443', ev: 'yes', et: 'no', ex: 'no' });
    await compatibilityFailure(worker, env, target, /Surge.*TLS Trojan/);
  });
}

for (const target of ['loon', 'quanx']) {
  test(`${target}: VLESS-only subscriptions keep their supported proxy`, async t => {
    const { worker } = await loadWorker(t);
    const response = await request(worker,
      environment({ yx: 'edge.example:8443', ev: 'yes', et: 'no', ex: 'no' }),
      `/${UUID}/sub?target=${target}`);
    assert.equal(response.status, 200);
    const nodes = localNodes(target, await response.text());
    assert.equal(nodes.length, 1);
    assert.match(nodes[0], /vless/);
    assert.match(nodes[0], /edge\.example(?::|,\s*)8443/);
  });
}

for (const target of ['surge', 'loon', 'quanx']) {
  for (const [description, password] of [
    ['comma', 'fixture,password'], ['line feed', 'fixture\npassword'], ['carriage return', 'fixture\rpassword']
  ]) {
    test(`${target}: passwords containing ${description} reject before emitting broken INI`, async t => {
      const { worker } = await loadWorker(t);
      const env = environment({ ...trojanOnly, yx: 'edge.example:8443', tp: password });
      await compatibilityFailure(worker, env, target, /密码.*V2Ray\/base64.*Sing-box/);
    });
  }

  test(`${target}: a representable Trojan password remains intact`, async t => {
    const { worker } = await loadWorker(t);
    const password = 'fixture@password:with/#%';
    const response = await request(worker, environment({ ...trojanOnly, yx: 'edge.example:8443', tp: password }),
      `/${UUID}/sub?target=${target}`);
    assert.equal(response.status, 200);
    const nodes = localNodes(target, await response.text());
    assert.equal(nodes.length, 1);
    assert.ok(nodes[0].includes(`password=${password},`));
  });
}

for (const target of ['base64', 'clash', 'singbox']) {
  test(`${target}: passwords containing INI delimiters keep the original secret`, async t => {
    const { worker } = await loadWorker(t);
    const password = 'fixture,password\nnext-line';
    const response = await request(worker, environment({ ...trojanOnly, yx: 'edge.example:8443', tp: password }),
      `/${UUID}/sub?target=${target}`);
    assert.equal(response.status, 200);
    const text = await response.text();
    const actual = target === 'base64' ? decodeURIComponent(new URL(atob(text)).username)
      : target === 'clash' ? parse(text).proxies[0].password
      : JSON.parse(text).outbounds.find(node => node.type === 'trojan').password;
    assert.equal(actual, password);
  });
}

test('XHTTP-only subscriptions reject HTTP ports while TLS-only mode remains enforced', async t => {
  const { worker } = await loadWorker(t);
  for (const dkby of ['yes', 'no']) {
    for (const port of [80, 8080, 8880, 2052, 2082, 2086, 2095]) {
      const env = environment({ yx: `edge.example:${port}`, ev: 'no', et: 'no', ex: 'yes', dkby });
      const response = await request(worker, env);
      assert.equal(response.status, 503, `HTTP port ${port}, TLS-only=${dkby}`);
      assert.match(await response.text(), /有效节点/);
    }
  }
});

test('XHTTP filters only HTTP nodes and keeps TLS endpoints in source order', async t => {
  const { worker } = await loadWorker(t);
  const nodes = await subscription(worker, environment({ ev: 'no', et: 'no', ex: 'yes',
    yx: 'first.example:80,tls.example:8443,second.example:8080,last.example:443' }));
  assert.deepEqual(nodes.map(node => [node.hostname, node.port, node.searchParams.get('security')]), [
    ['tls.example', '8443', 'tls'], ['last.example', '443', 'tls']
  ]);
  assert.ok(nodes.every(node => node.searchParams.get('type') === 'xhttp'));
});

test('HTTP sources keep working WebSocket nodes when XHTTP is enabled', async t => {
  const { worker } = await loadWorker(t);
  const nodes = await subscription(worker, environment({ yx: 'edge.example:8080', dkby: 'no' }));
  assert.deepEqual(nodes.map(node => [node.protocol, node.searchParams.get('type'), node.searchParams.get('security')]), [
    ['vless:', 'ws', 'none'], ['trojan:', 'ws', 'none']
  ]);
});
