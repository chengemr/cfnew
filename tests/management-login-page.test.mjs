import assert from 'node:assert/strict';
import test from 'node:test';
import { ADMIN_TOKEN, ORIGIN, UUID, environment, loadWorker, mockKV } from './helpers/worker.mjs';

const raw = (worker, env, path, options = {}) => worker.fetch(new Request(ORIGIN + path, options), env, { waitUntil() {} });
const post = (body, headers = {}) => ({ method: 'POST', headers: { Origin: ORIGIN,
  'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

for (const { token = UUID, d = '', kv = true } of [
  {}, { token: UUID.replaceAll('-', ''), kv: false },
  { d: '/private/multi/panel/' }, { d: '/login', kv: false }
]) {
  const base = d.replace(/\/$/, '') || '/' + token;
  test(`custom homepage keeps browser login available at ${base}/login`, async t => {
    let homepageFetches = 0;
    const { worker, advanceTime } = await loadWorker(t, { globals: {
      fetch: async () => {
        homepageFetches++;
        return new Response('<!doctype html><title>Custom home</title>', { headers: { 'Content-Type': 'text/html' } });
      }
    } });
    const values = { d, homepage: 'https://homepage.example/', yx: 'edge.example:443' };
    const env = environment({ u: token, ...(kv ? { C: mockKV(values) } : values) });
    assert.match(await (await raw(worker, env, '/')).text(), /Custom home/);
    assert.equal(homepageFetches, 1);

    const expired = await raw(worker, env, base);
    assert.equal(expired.status, 302);
    assert.equal(expired.headers.get('Location'), base + '/login');
    for (const suffix of ['/login', '/login/']) {
      const loginPage = await raw(worker, env, base + suffix);
      assert.equal(loginPage.status, 200);
      assert.equal(loginPage.headers.get('Cache-Control'), 'no-store');
      const html = await loginPage.text();
      assert.ok(html.includes('id="connectForm"'));
      assert.ok(!html.includes(ADMIN_TOKEN) && !html.includes(token));
      if (d && d !== '/login') assert.ok(!html.includes(d.replace(/\/$/, '')));
    }
    assert.equal(homepageFetches, 1, 'the dedicated login page must not fetch the custom homepage');

    const login = await raw(worker, env, base + '/api/login', post({ token: ADMIN_TOKEN }));
    assert.equal(login.status, 200);
    const Cookie = login.headers.get('Set-Cookie').split(';')[0];
    assert.equal((await raw(worker, env, base, { headers: { Cookie } })).status, 200);
    advanceTime(8 * 60 * 60 * 1000);
    const afterExpiry = await raw(worker, env, base, { headers: { Cookie } });
    assert.equal(afterExpiry.status, 302);
    assert.equal(afterExpiry.headers.get('Location'), base + '/login');
    assert.equal((await raw(worker, env, base + '/login')).status, 200);
    assert.equal(homepageFetches, 1);
  });
}

test('dedicated login pages preserve language detection and cookie preference', async t => {
  const { worker } = await loadWorker(t);
  const env = environment({ d: '/private/panel', homepage: 'https://homepage.example/' });
  for (const [headers, language] of [
    [{ 'Accept-Language': 'fa-IR,fa;q=0.9' }, 'fa-IR'],
    [{ Cookie: 'preferredLanguage=fa' }, 'fa-IR'],
    [{ Cookie: 'preferredLanguage=zh', 'Accept-Language': 'fa-IR' }, 'zh-CN']
  ]) {
    const response = await raw(worker, env, '/private/panel/login', { headers });
    assert.equal(response.status, 200);
    assert.ok((await response.text()).includes(`<html lang="${language}"`));
  }
  assert.equal((await raw(worker, env, '/login')).status, 404);
  assert.equal((await raw(worker, env, `/${UUID}/login`)).status, 403);
});
