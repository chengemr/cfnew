import assert from 'node:assert/strict';
import test from 'node:test';
import { Script } from 'node:vm';
import { UUID, environment, loadWorker, request } from './helpers/worker.mjs';

for (const path of ['/', `/${UUID}`]) {
  for (const [language, headers] of [
    ['zh-CN', {}],
    ['fa-IR', { 'Accept-Language': 'fa-IR,fa;q=0.9' }],
    ['zh-CN', { Cookie: 'preferredLanguage=zh', 'Accept-Language': 'fa-IR' }]
  ]) {
    test(`${path}: renders ${language} and valid browser scripts`, async t => {
      const { worker } = await loadWorker(t);
      const response = await request(worker, environment(), path, { headers });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('content-type'), /^text\/html/);
      const html = await response.text();
      assert.ok(html.includes(`<html lang="${language}"`));
      const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
      assert.ok(scripts.length > 0);
      for (const [tag, script] of scripts) {
        if (!tag.includes('type="application/json"')) new Script(script);
      }
    });
  }
}

test('landing supports custom-path mode without exposing the management credential', async t => {
  const { worker } = await loadWorker(t);
  const response = await request(worker, environment({ d: '/new/path' }), '/');
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes('"customPathMode":true'));
  assert.ok(!html.includes('/new/path'));
  assert.ok(html.includes('请输入你 D 变量的值'));
});

function bootstrap(html) {
  return JSON.parse(html.match(/<script id="boot" type="application\/json">([\s\S]*?)<\/script>/)[1]);
}

test('dashboard reads effective environment configuration without a KV binding', async t => {
  const { worker } = await loadWorker(t);
  const response = await request(worker, environment({ S: 'user:password@proxy.example:1080', QJ: 'only', ET: 'YES' }), `/${UUID}`);
  const html = await response.text();
  const boot = bootstrap(html);
  assert.equal(boot.kvEnabled, false);
  assert.equal(boot.config.s, 'user:password@proxy.example:1080');
  assert.equal(boot.config.qj, 'only');
  const controls = [...html.matchAll(/data-config="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(controls).size, controls.length);
  assert.deepEqual(controls.slice().sort(), boot.keys.slice().sort());
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('dashboard safely embeds configuration containing HTML and script delimiters', async t => {
  const { worker } = await loadWorker(t);
  const value = '</script><script>window.injected=true</script>&\u2028';
  const response = await request(worker, environment({ tp: value }), `/${UUID}`);
  const html = await response.text();
  assert.equal(bootstrap(html).config.tp, value);
  assert.ok(!html.includes(value));
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 2);
  for (const [tag, script] of scripts) if (!tag.includes('application/json')) new Script(script);
});
