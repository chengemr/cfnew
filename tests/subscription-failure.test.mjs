import assert from 'node:assert/strict';
import test from 'node:test';
import { parse } from 'yaml';
import { UUID, environment, loadWorker, request } from './helpers/worker.mjs';
import { timerRuntime } from './helpers/timers.mjs';
import { flush } from './helpers/transports.mjs';

const source = 'https://preferred.example/list';
const env = environment({ epd: 'no', epi: 'no', egi: 'yes', yxURL: source, et: 'no', ex: 'no' });
for (const target of ['base64', 'clash', 'singbox']) {
  for (const failure of ['http', 'timeout', 'empty', 'invalid', 'invalid-csv']) {
    test(`${target}: sole preferred source ${failure} fails with 503 and no placeholder`, async t => {
      const timers = timerRuntime();
      let calls = 0, cancelled = false, body;
      const { worker } = await loadWorker(t, { globals: { ...timers.globals,
        fetch(url, { signal }) {
          assert.equal(url, source);
          calls++;
          if (failure === 'timeout') return new Promise((_, reject) => signal.addEventListener('abort', () => {
            cancelled = true; reject(signal.reason);
          }));
          const content = failure === 'http' ? '192.0.2.1:443' : failure === 'empty' ? ' \n' : failure === 'invalid'
            ? '<html>upstream error</html>\n192.0.2.1:65536\n999.999.999.999:443\n[2001:db8:::1]:443'
            : 'IP地址,端口,数据中心\n999.999.999.999,443,FAIL\n192.0.2.1,65536,FAIL';
          body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(content)); controller.close(); },
            cancel() { cancelled = true; } });
          return new Response(body, { status: failure === 'http' ? 503 : 200 });
        }
      } });
      const pending = request(worker, env, `/${UUID}/sub?target=${target}`);
      await flush();
      if (failure === 'timeout') await timers.tick(5_000);
      const response = await pending;
      assert.equal(response.status, 503);
      assert.match(await response.text(), /有效节点/);
      assert.match(response.headers.get('cache-control'), /no-store/);
      assert.equal(calls, 1, 'disabled sources must stay disabled');
      assert.equal(timers.pending.size, 0);
      if (failure === 'http' || failure === 'timeout') assert.equal(cancelled, true);
      if (body) assert.equal(body.locked, false);
    });
  }

  test(`${target}: an enabled native source still succeeds when preferred retrieval fails`, async t => {
    const { worker } = await loadWorker(t, { globals: { fetch: () => new Response('error', { status: 503 }) } });
    const response = await request(worker, { ...env, ena: 'yes' }, `/${UUID}/sub?target=${target}`);
    assert.equal(response.status, 200);
    const content = await response.text();
    const servers = target === 'base64' ? atob(content).split('\n').map(link => new URL(link).hostname)
      : target === 'clash' ? parse(content).proxies.map(node => node.server)
      : JSON.parse(content).outbounds.filter(node => node.type === 'vless').map(node => node.server);
    assert.deepEqual(servers, ['worker.example']);
  });
}

test('all node sources disabled returns 503 without enabling any fallback', async t => {
  const { worker } = await loadWorker(t);
  const response = await request(worker, environment({ epd: 'no', epi: 'no', egi: 'no', ena: 'no' }));
  assert.equal(response.status, 503);
});

// Existing Base64 links require IDNs in their serialized (punycode) form.
for (const host of ['cdn_under.example', 'xn--fsqu00a.xn--0zwm56d', 'edge']) {
  test(`existing custom hostname ${host} retains URL/client compatibility`, async t => {
    const { worker } = await loadWorker(t);
    const response = await request(worker, environment({ yx: `${host}:8443`, et: 'no', ex: 'no' }));
    assert.equal(response.status, 200);
    const nodes = atob(await response.text()).split('\n').map(link => new URL(link));
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].hostname, new URL(`http://${host}`).hostname);
    assert.equal(nodes[0].port, '8443');
  });
}
