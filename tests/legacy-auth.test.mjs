import assert from 'node:assert/strict';
import test from 'node:test';
import { loadLegacy } from './helpers/legacy.mjs';
import { flush, websocketRuntime } from './helpers/transports.mjs';

const files = ['edgetunnel经典轻量版', 'snippets'];
const origin = 'https://worker.example';
const uuid = 'aabbccdd-1234-4567-89ab-aabbccddeeff';
const publicTokens = ['2541f8d4-d157-46af-9169-0025bf435fbc', 'f64bdc57-0f54-4705-bf75-cfd646d98c06'];

function request(path, options = {}) {
  return new Request(origin + path, { ...options, headers: { Host: 'worker.example', ...options.headers } });
}

function packet(token) {
  const bytes = Uint8Array.from(token.replaceAll('-', '').match(/../g), value => parseInt(value, 16));
  return Uint8Array.of(0, ...bytes, 0, 1, 1, 187, 1, 192, 0, 2, 10, 0x16).buffer;
}

for (const file of files) {
  test(`${file}: shipped empty credential rejects every entry before upgrading or networking`, async () => {
    const runtime = websocketRuntime();
    const { worker, attempts } = await loadLegacy(file, { globals: runtime.globals });
    for (const input of [request('/'), request(`/${publicTokens[0]}`), request(`/${publicTokens[1]}/sub`),
      request('/', { method: 'POST' }), request('/', { headers: { Upgrade: 'websocket' } })]) {
      // These standalone entries require editing their source configuration,
      // even when the deployment happens to have U/u bindings.
      const response = await worker.fetch(input, { u: uuid, U: uuid }, {});
      assert.equal(response.status, 503);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    assert.deepEqual(attempts, []);
    assert.equal(runtime.pairs.length, 0);
  });

  for (const token of [undefined, null, 42, '', 'invalid', 'aabbccdd-1234-4567-89ab-aabbccddeefg',
    ...publicTokens, ...publicTokens.map(value => ` ${value.toUpperCase()} `)]) {
    test(`${file}: ${JSON.stringify(token)} credential loads safely and refuses HTTP/WS`, async () => {
      const runtime = websocketRuntime();
      const { worker, attempts } = await loadLegacy(file, { token, globals: runtime.globals });
      for (const input of [request(`/${uuid}/sub`), request('/', { headers: { Upgrade: 'websocket' } })]) {
        assert.equal((await worker.fetch(input, {}, {})).status, 503);
      }
      assert.deepEqual(attempts, []);
      assert.equal(runtime.pairs.length, 0);
    });
  }

  for (const token of [uuid, ` ${uuid.toUpperCase()} `]) {
    test(`${file}: private credential serves subscriptions and authenticates WS without environment bindings`, async t => {
      const runtime = websocketRuntime();
      const destinations = [];
      const writes = [];
      const ends = [];
      const { worker, attempts } = await loadLegacy(file, {
        token,
        globals: { ...runtime.globals, fetch: async url => {
          assert.equal(url, 'https://raw.githubusercontent.com/qwer-search/bestip/refs/heads/main/kejilandbestip.txt');
          return new Response('', { status: 200 });
        } },
        connect(target) {
          destinations.push({ ...target });
          let controller, resolveClosed;
          const socket = {
            closed: new Promise(resolve => { resolveClosed = resolve; }),
            readable: new ReadableStream({ start(value) { controller = value; controller.enqueue(Uint8Array.of(42)); } }),
            writable: new WritableStream({ write(value) { writes.push(new Uint8Array(value).slice()); } }),
            close() { try { controller.close(); } catch {} resolveClosed(); }
          };
          ends.push(() => socket.close());
          return socket;
        }
      });
      t.after(() => ends.forEach(end => end()));
      const path = `/${uuid}` + (file === 'snippets' ? '/sub' : '');
      const subscription = await worker.fetch(request(path), {}, {});
      assert.equal(subscription.status, 200);
      const links = atob(await subscription.text()).split('\n');
      assert.ok(links.length > 0);
      for (const link of links) assert.equal(new URL(link).username, uuid);
      assert.deepEqual(destinations, []);
      const upgrade = await worker.fetch(request('/', { headers: { Upgrade: 'websocket' } }), {}, {});
      assert.equal(upgrade.status, 101);
      const websocket = runtime.pairs[0][1];
      websocket.receive(packet(uuid));
      for (let index = 0; index < 6; index++) await flush();
      assert.deepEqual(destinations, [{ hostname: '192.0.2.10', port: 443 }]);
      assert.deepEqual(writes.map(value => [...value]), [[0x16]]);
      assert.deepEqual(attempts, []);
      websocket.close();
      await flush();
    });
  }

  test(`${file}: private configuration rejects old public credentials during WS authentication`, async () => {
    const runtime = websocketRuntime();
    const { worker, attempts } = await loadLegacy(file, { token: uuid, globals: runtime.globals });
    for (const token of publicTokens) {
      const upgrade = await worker.fetch(request('/', { headers: { Upgrade: 'websocket' } }), {}, {});
      assert.equal(upgrade.status, 101);
      const websocket = runtime.pairs.at(-1)[1];
      websocket.receive(packet(token));
      for (let index = 0; index < 3; index++) await flush();
      assert.equal(websocket.readyState, 3);
    }
    assert.deepEqual(attempts, []);
  });
}
