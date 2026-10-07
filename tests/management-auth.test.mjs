import assert from 'node:assert/strict';
import test from 'node:test';
import { ADMIN_TOKEN, ORIGIN, UUID, environment, loadWorker, mockKV } from './helpers/worker.mjs';
import { timerRuntime } from './helpers/timers.mjs';
import { flush } from './helpers/transports.mjs';

const base = `/${UUID}`;
const raw = (worker, env, path, options = {}) => worker.fetch(new Request(ORIGIN + path, options), env, { waitUntil() {} });
const post = (value, headers = {}) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(value) });
async function login(worker, env, path = base) {
  const response = await raw(worker, env, path + '/api/login', post({ token: env.ADMIN_TOKEN || env.admin_token }, { Origin: ORIGIN }));
  assert.equal(response.status, 200);
  return response.headers.get('Set-Cookie').split(';')[0];
}

for (const customPath of ['', '/private/panel']) {
  test(`subscription access does not authorize management: ${customPath || 'UUID'}`, async t => {
    const { worker } = await loadWorker(t);
    const C = mockKV({ d: customPath, ae: 'no', s: 'user:fixture-password@proxy.example:1080', tp: 'fixture-trojan-secret' });
    const env = environment({ C, yx: 'edge.example:443' });
    const path = customPath || base;
    assert.equal((await raw(worker, env, path + '/sub')).status, 200);
    for (const suffix of ['/api/config', '/api/preferred-ips', '/region', '/test-api']) {
      const response = await raw(worker, env, path + suffix);
      assert.equal(response.status, 401, suffix);
      const body = await response.text();
      assert.ok(!body.includes('fixture-password') && !body.includes('fixture-trojan-secret'));
    }
    assert.equal((await raw(worker, env, path + '/api/config', post({ s: '' }))).status, 401);
    assert.deepEqual(C.writes, []);
    const page = await raw(worker, env, path);
    assert.equal(page.status, 302);
    assert.equal(page.headers.get('Location'), '/');
  });
}

for (const secret of [undefined, '', 'short', 'a'.repeat(257), 'bad secret'.repeat(8), UUID, UUID.replaceAll('-', '')]) {
  test(`management fails closed with missing, malformed or shared ADMIN_TOKEN: ${String(secret).slice(0, 20)}`, async t => {
    const { worker } = await loadWorker(t);
    const env = environment({ ADMIN_TOKEN: secret, C: mockKV(), yx: 'edge.example:443' });
    assert.equal((await raw(worker, env, base + '/sub')).status, 200);
    for (const suffix of ['', '/api/config', '/api/login']) {
      const response = await raw(worker, env, base + suffix, suffix === '/api/login' ? post({ token: secret }) : {});
      assert.equal(response.status, 503);
    }
  });
}

test('management secret cannot equal a shared custom path or Trojan password', async t => {
  const { worker } = await loadWorker(t);
  for (const values of [{ d: '/' + ADMIN_TOKEN }, { d: ' /' + ADMIN_TOKEN + '/ ' },
    { d: '/%74' + ADMIN_TOKEN.slice(1) }, { d: '/%2574' + ADMIN_TOKEN.slice(1) }, { tp: ADMIN_TOKEN }]) {
    const env = environment({ ...values, C: mockKV(), yx: 'edge.example:443' });
    const path = values.d ? '/' + values.d.trim().replace(/^\/+|\/+$/g, '') : base;
    assert.equal((await raw(worker, env, path + '/api/config', { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } })).status, 503);
  }
});

test('independent Bearer credential authorizes reads and writes without exposing itself', async t => {
  const { worker } = await loadWorker(t);
  const C = mockKV({ ae: 'yes' });
  const env = environment({ C, yx: 'edge.example:443' });
  const headers = { Authorization: `Bearer ${ADMIN_TOKEN}` };
  for (const suffix of ['', '/api/config', '/api/preferred-ips', '/region']) {
    const response = await raw(worker, env, base + suffix, { headers });
    assert.equal(response.status, 200);
    assert.ok(!(await response.text()).includes(ADMIN_TOKEN));
  }
  assert.equal((await raw(worker, env, base + '/api/config', post({ alpn: 'h2' }, headers))).status, 200);
  assert.equal(JSON.parse(C.data.get('c')).alpn, 'h2');
  for (const token of [UUID, UUID.replaceAll('-', ''), 'wrong-management-token-0123456789abcdef']) {
    assert.equal((await raw(worker, env, base + '/api/config', { headers: { Authorization: `Bearer ${token}` } })).status, 401);
  }
});

test('browser login issues a signed HttpOnly cookie and accepts same-origin writes', async t => {
  const { worker } = await loadWorker(t);
  const C = mockKV();
  const env = environment({ C });
  const response = await raw(worker, env, base + '/api/login', post({ token: ADMIN_TOKEN }, { Origin: ORIGIN }));
  assert.equal(response.status, 200);
  const setCookie = response.headers.get('Set-Cookie');
  for (const flag of ['HttpOnly', 'SameSite=Strict', 'Secure', 'Path=/', 'Max-Age=28800']) assert.ok(setCookie.includes(flag));
  assert.ok(!setCookie.includes(ADMIN_TOKEN));
  const Cookie = setCookie.split(';')[0];
  assert.equal((await raw(worker, env, base + '/api/config', { headers: { Cookie } })).status, 200);
  assert.equal((await raw(worker, env, base + '/api/config', post({ alpn: 'h2' }, { Cookie, Origin: ORIGIN }))).status, 200);
  assert.equal(JSON.parse(C.data.get('c')).alpn, 'h2');
  assert.equal((await raw(worker, env, base + '/api/config', post({ alpn: 'http/1.1' }, { Cookie, Referer: ORIGIN + '/' }))).status, 200);
});

test('forged, expired, host-mismatched and rotated-secret cookies are rejected', async t => {
  const { worker, advanceTime } = await loadWorker(t);
  const env = environment({ C: mockKV() });
  const Cookie = await login(worker, env);
  for (const forged of ['cfnew_admin_session=' + ADMIN_TOKEN, Cookie.replace(/.$/, Cookie.endsWith('A') ? 'B' : 'A'), 'cfnew_admin_session=v1.9999999999999.' + 'A'.repeat(43)]) {
    assert.equal((await raw(worker, env, base + '/api/config', { headers: { Cookie: forged } })).status, 401);
  }
  const rotated = { ...env, ADMIN_TOKEN: 'rotated-management-token-0123456789abcdef0123456789abcdef' };
  assert.equal((await raw(worker, rotated, base + '/api/config', { headers: { Cookie } })).status, 401);
  assert.equal((await worker.fetch(new Request('https://another.example' + base + '/api/config', { headers: { Cookie } }), env, {})).status, 401);
  advanceTime(8 * 60 * 60 * 1000);
  assert.equal((await raw(worker, env, base + '/api/config', { headers: { Cookie } })).status, 401);
});

test('login and authenticated mutations reject cross-origin browser requests', async t => {
  const { worker } = await loadWorker(t);
  const C = mockKV();
  const env = environment({ C });
  const Cookie = await login(worker, env);
  for (const headers of [{ Origin: 'https://foreign.example' }, { Origin: 'null' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await raw(worker, env, base + '/api/login', post({ token: ADMIN_TOKEN }, headers))).status, 403);
    assert.equal((await raw(worker, env, base + '/api/config', post({ alpn: 'h2' }, { ...headers, Cookie }))).status, 403);
  }
  assert.equal((await raw(worker, env, base + '/api/config', post({ alpn: 'h2' }, { Cookie }))).status, 403);
  assert.deepEqual(C.writes, []);
});

test('invalid login bodies fail without issuing a session', async t => {
  const { worker } = await loadWorker(t);
  const env = environment();
  for (const [body, status] of [['{bad', 400], [JSON.stringify({ token: UUID }), 401], [JSON.stringify({ token: {} }), 401], [' '.repeat(4097), 400]]) {
    const response = await raw(worker, env, base + '/api/login', { method: 'POST', body });
    assert.equal(response.status, status);
    assert.equal(response.headers.get('Set-Cookie'), null);
  }
  assert.equal((await raw(worker, env, base + '/api/login')).status, 405);
  assert.equal((await raw(worker, env, '/incorrect/api/login', post({ token: ADMIN_TOKEN }))).status, 404);
});

test('logout clears the session cookie and public HTML contains no credentials', async t => {
  const { worker } = await loadWorker(t);
  const env = environment({ C: mockKV(), yx: 'edge.example:443' });
  const Cookie = await login(worker, env);
  const response = await raw(worker, env, base + '/api/logout', post({}, { Cookie, Origin: ORIGIN }));
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Set-Cookie'), /cfnew_admin_session=;.*Max-Age=0/);
  assert.equal((await raw(worker, env, base + '/api/config')).status, 401);
  const landing = await (await raw(worker, env, '/')).text();
  assert.ok(!landing.includes(ADMIN_TOKEN) && !landing.includes(UUID));
});

test('lowercase admin_token alias authorizes the same management API', async t => {
  const { worker } = await loadWorker(t);
  const env = environment({ ADMIN_TOKEN: undefined, admin_token: ADMIN_TOKEN, C: mockKV() });
  assert.equal((await raw(worker, env, base + '/api/config', { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } })).status, 200);
});

test('chunked login bodies stop at the byte limit and cancel their reader', async t => {
  const { worker } = await loadWorker(t);
  let pulls = 0, cancelled = false;
  const body = new ReadableStream({
    pull(controller) { pulls++; controller.enqueue(new Uint8Array(4096)); },
    cancel() { cancelled = true; }
  }, { highWaterMark: 0 });
  const response = await raw(worker, environment(), base + '/api/login', { method: 'POST', body, duplex: 'half' });
  assert.equal(response.status, 400);
  assert.equal(pulls, 2);
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
});

test('a stalled login body has a five-second deadline and releases its reader', async t => {
  const timers = timerRuntime();
  const { worker } = await loadWorker(t, { globals: timers.globals });
  let cancelled = false;
  const body = new ReadableStream({ cancel() { cancelled = true; } }, { highWaterMark: 0 });
  const pending = raw(worker, environment(), base + '/api/login', { method: 'POST', body, duplex: 'half' });
  await flush();
  await timers.tick(5_000);
  assert.equal((await pending).status, 408);
  assert.equal(cancelled, true);
  assert.equal(body.locked, false);
  assert.equal(timers.pending.size, 0);
});
