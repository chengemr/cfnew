import assert from 'node:assert/strict';
import test from 'node:test';
import { parse } from 'yaml';
import { ORIGIN, UUID, environment, loadWorker, request, subscription } from './helpers/worker.mjs';
import { residentialResponse } from './helpers/residential.mjs';
import { context, flush, vlessHeader, websocketRuntime } from './helpers/transports.mjs';

const families = [
  ['clash', ['clash', 'clashr', 'stash', 'meta', 'clashmeta']],
  ['residential', ['vg', 'jk', 'jiakuan']],
  ['surge', ['surge', 'surge2', 'surge3', 'surge4']],
  ['quantumult', ['quantumult', 'quanx']],
  ['loon', ['loon']],
  ['singbox', ['singbox', 'sing-box']]
];
const onlyXHTTP = { ev: 'no', et: 'no', ex: 'yes' };
const customNodes = { yx: 'example.com:8443', jk: 'yes' };

function clientNodes(family, text) {
  if (family === 'clash' || family === 'residential') {
    return parse(text).proxies.filter(node => node.type !== 'openvpn');
  }
  if (family === 'singbox') return JSON.parse(text).outbounds.filter(node => node.server);
  const section = family === 'quantumult' ? 'server_local' : 'Proxy';
  return text.split(`[${section}]`)[1].split(/\n\[/)[0].split('\n')
    .filter(line => /\S/.test(line)).map(line => ({ type: /(?:=\s*trojan,|^trojan=)/.test(line) ? 'trojan' : 'other' }));
}

for (const [family, aliases] of families) {
  for (const target of aliases) {
    test(`${target}: XHTTP-only subscriptions reject before fetching node sources`, async t => {
      const { worker } = await loadWorker(t);
      const env = environment({ ...onlyXHTTP, jk: 'yes', epd: 'no', epi: 'no',
        egi: 'yes', yxURL: 'https://preferred.example/list' });
      const response = await request(worker, env, `/${UUID}/sub?target=${target}`);
      assert.equal(response.status, 422);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.match(await response.text(), /XHTTP.*V2Ray\/base64/);
    });

    test(`${target}: Trojan plus XHTTP advertises only the enabled compatible protocol`, async t => {
      const options = family === 'residential' ? { globals: { fetch: residentialResponse } } : {};
      const { worker } = await loadWorker(t, options);
      const env = environment({ ...customNodes, ...onlyXHTTP, et: 'yes' });
      const response = await request(worker, env, `/${UUID}/sub?target=${target}`);
      assert.equal(response.status, 200);
      const nodes = clientNodes(family, await response.text());
      assert.equal(nodes.length, 1);
      assert.ok(nodes.every(node => node.type === 'trojan'));
    });
  }
}

for (const target of ['ClAsH', 'SiNg-BoX']) {
  test(`${target}: client compatibility checks match case-insensitive dispatch`, async t => {
    const { worker } = await loadWorker(t);
    assert.equal((await request(worker, environment({ ...customNodes, ...onlyXHTTP }),
      `/${UUID}/sub?target=${target}`)).status, 422);
  });
}

for (const target of ['vg', 'jk', 'jiakuan']) {
  test(`${target}: disabled residential subscriptions retain their existing HTTP 403`, async t => {
    const { worker } = await loadWorker(t);
    assert.equal((await request(worker, environment({ ...onlyXHTTP, jk: 'no' }),
      `/${UUID}/sub?target=${target}`)).status, 403);
  });
}

for (const target of ['base64', 'v2ray', 'ss', 'ssr', 'V2RAY']) {
  test(`${target}: raw subscriptions preserve native XHTTP transport and padding`, async t => {
    const { worker } = await loadWorker(t);
    const nodes = await subscription(worker, environment({ ...customNodes, ...onlyXHTTP }),
      `/${UUID}/sub?target=${target}`);
    assert.equal(nodes.length, 1);
    const node = nodes[0];
    assert.equal(node.protocol, 'vless:');
    assert.equal(node.searchParams.get('type'), 'xhttp');
    assert.equal(node.searchParams.get('path'), '/' + UUID.slice(0, 8));
    assert.equal(node.searchParams.get('mode'), 'stream-one');
    assert.equal(node.searchParams.get('security'), 'tls');
    const padding = JSON.parse(node.searchParams.get('extra'));
    assert.equal(padding.xPaddingObfsMode, true);
    assert.equal(padding.xPaddingPlacement, 'queryInHeader');
    assert.ok(padding.xPaddingHeader && padding.xPaddingKey);
  });
}

for (const family of ['clash', 'singbox']) {
  test(`${family}: remote lists also omit the unusable XHTTP-to-WS fallback`, async t => {
    const source = 'https://preferred.example/list';
    const { worker } = await loadWorker(t, { globals: { fetch(url) {
      assert.equal(url, source);
      return new Response('192.0.2.10:8443');
    } } });
    const response = await request(worker, environment({ ...onlyXHTTP, et: 'yes',
      epd: 'no', epi: 'no', egi: 'yes', yxURL: source }), `/${UUID}/sub?target=${family}`);
    assert.equal(response.status, 200);
    const nodes = clientNodes(family, await response.text());
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].type, 'trojan');
  });

  test(`${family}: existing XHTTP-to-WS fallback authenticates when VLESS/WS is enabled`, async t => {
    const runtime = websocketRuntime();
    const attempts = [];
    const { worker } = await loadWorker(t, { globals: runtime.globals, connect(destination) {
      attempts.push(destination);
      throw new Error('fixture stops after authentication and destination selection');
    } });
    const env = environment({ ...customNodes, ev: 'yes', et: 'no', ex: 'yes' });
    const response = await request(worker, env, `/${UUID}/sub?target=${family}`);
    assert.equal(response.status, 200);
    const nodes = clientNodes(family, await response.text());
    assert.equal(nodes.length, 2, 'preserve both existing WS nodes and Work XHTTP conversion');
    const pathOf = node => family === 'clash' ? node['ws-opts'].path : node.transport.path;
    const converted = nodes.find(node => pathOf(node) === '/' + UUID.slice(0, 8));
    assert.ok(converted, 'missing existing XHTTP-to-WS fallback');
    const upgraded = await worker.fetch(new Request(new URL(pathOf(converted), ORIGIN),
      { headers: { Upgrade: 'websocket' } }), env, context);
    assert.equal(upgraded.status, 101);
    runtime.pairs[0][1].receive(vlessHeader());
    for (let index = 0; index < 5; index++) await flush();
    assert.ok(attempts.some(destination => destination.hostname === '192.0.2.10'));
  });
}

test('client subscription filtering does not enable the disabled VLESS/WS receiver', async t => {
  const runtime = websocketRuntime();
  const attempts = [];
  const { worker } = await loadWorker(t, { globals: runtime.globals, connect(destination) {
    attempts.push(destination);
    throw new Error('unexpected destination dial');
  } });
  const env = environment({ ...customNodes, ...onlyXHTTP, et: 'yes' });
  assert.equal((await request(worker, env, `/${UUID}/sub?target=clash`)).status, 200);
  await worker.fetch(new Request(ORIGIN + '/' + UUID.slice(0, 8),
    { headers: { Upgrade: 'websocket' } }), env, context);
  runtime.pairs[0][1].receive(vlessHeader());
  for (let index = 0; index < 5; index++) await flush();
  assert.deepEqual(attempts, []);
  assert.equal(runtime.pairs[0][1].readyState, 3);
});
