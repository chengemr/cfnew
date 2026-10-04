import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test, { before, after } from 'node:test';
import { UUID, environment, loadWorker, mockKV } from '../helpers/worker.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CFNEW_PLAYWRIGHT_MODULE || 'playwright');
let browser;
before(async () => {
  const bundled = process.env.CFNEW_CHROMIUM_MODULE ? require(process.env.CFNEW_CHROMIUM_MODULE) : null;
  const executable = bundled?.default || bundled;
  browser = await chromium.launch(executable ? {
    executablePath: process.env.CFNEW_CHROME_EXECUTABLE || await executable.executablePath(),
    headless: true, args: executable.args.filter(arg => arg !== '--single-process')
  } : { headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); });

let fontCSS = '';
if (process.env.CFNEW_QA_FONT_DIR) {
  const root = process.env.CFNEW_QA_FONT_DIR;
  fontCSS = readFileSync(resolve(root, 'chinese-simplified-400.css'), 'utf8')
    .replace(/url\(([^)]+)\)/g, (_, path) => 'url(data:font/woff2;base64,' + readFileSync(resolve(root, path)).toString('base64') + ')')
    + ':root{font-family:"Noto Sans SC",Arial,sans-serif}';
}

async function app(t, { stored = {}, env = {}, kv = true, mobile = false, fa = false } = {}) {
  const binding = mockKV({ d: '/existing/panel', yx: 'example.com:8443#旧节点',
    s: 'user:password@proxy.example:1080', qj: 'only', ...stored });
  const config = environment({ ex: 'no', egi: 'yes', d: '/env/panel', ...(kv ? { C: binding } : {}), ...env });
  const { worker } = await loadWorker(t);
  const requests = [];
  const server = createServer(async (req, res) => {
    try {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;
      requests.push({ method: req.method, path: req.url, body: body ? JSON.parse(body) : null });
      const response = await worker.fetch(new Request(`http://127.0.0.1:${server.address().port}${req.url}`, {
        method: req.method, headers: req.headers, ...(body ? { body } : {})
      }), config, { waitUntil() {} });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) { res.writeHead(500); res.end(error.message); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(done => server.close(done)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1080 },
    permissions: ['clipboard-read', 'clipboard-write'], ...(fa ? { extraHTTPHeaders: { 'Accept-Language': 'fa-IR' } } : {}) });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  t.after(async () => { try { assert.deepEqual(errors, []); } finally { await context.close(); } });
  const go = (suffix = '') => page.goto(origin + (kv ? '/existing/panel' : '/env/panel') + suffix);
  return { binding, config, requests, page, context, origin, go };
}
async function dirtyCount(page, count) { await page.waitForFunction(count => document.getElementById('saveState').textContent.startsWith(String(count)), count); }
async function save(page) {
  await page.locator('#saveConfig').click();
  await page.waitForFunction(() => document.getElementById('saveState').textContent === '所有更改已保存');
}

test('old KV data loads; query strings and fragments stay out of subscription URLs', async t => {
  const { page, requests, go, origin } = await app(t);
  await go('/?ignored=1#config');
  assert.equal(await page.locator('#s').inputValue(), 'user:password@proxy.example:1080');
  assert.equal(await page.locator('#qj').inputValue(), 'only');
  assert.equal(await page.locator('#et').isChecked(), true);
  assert.equal(await page.locator('#subscriptionUrl').inputValue(), origin + '/existing/panel/sub?target=clash');
  await page.locator('[data-nav="subscription"]').click();
  await page.locator('#client-3').click();
  assert.equal(await page.locator('#subscriptionUrl').inputValue(), origin + '/existing/panel/sub?target=singbox');
  assert.match(await page.locator('#importSubscription').getAttribute('href'), /^sing-box:\/\//);
  assert.equal(requests.filter(request => request.method === 'POST').length, 0);
});

test('saving changes only edited keys and preserves inherited/unknown configuration', async t => {
  const { page, binding, requests, go } = await app(t, { stored: { extensionKey: 'preserve-me' }, env: { homepage: 'https://example.com' } });
  await go('#config');
  await page.locator('#et').uncheck();
  await dirtyCount(page, 1); await save(page);
  const posts = requests.filter(request => request.method === 'POST');
  assert.deepEqual(posts[0].body, { et: 'no' });
  const stored = JSON.parse(binding.data.get('c'));
  assert.equal(stored.s, 'user:password@proxy.example:1080');
  assert.equal(stored.extensionKey, 'preserve-me');
  assert.ok(!('homepage' in stored));
});

test('custom-path saves immediately switch API and subscription addresses', async t => {
  const { page, requests, go, origin } = await app(t);
  await go('#advanced');
  await page.locator('#d').fill('/new/multi/panel'); await save(page);
  assert.equal(new URL(page.url()).pathname, '/new/multi/panel');
  assert.equal(await page.locator('#subscriptionUrl').inputValue(), origin + '/new/multi/panel/sub?target=clash');
  await page.locator('#refreshConfig').click();
  await page.waitForFunction(() => document.getElementById('toast').textContent === '已读取最新配置。');
  assert.ok(requests.some(request => request.method === 'GET' && request.path === '/new/multi/panel/api/config'));
});

test('invalid management paths are rejected before any KV write', async t => {
  const { page, requests, go } = await app(t);
  await go('#advanced');
  for (const path of ['/', '/new/../panel', '/new?mode=1', '/新路径']) {
    await page.locator('#d').fill(path); await page.locator('#saveConfig').click();
    assert.equal(await page.locator('#toast').getAttribute('class'), 'toast error');
    assert.equal(requests.filter(request => request.method === 'POST').length, 0);
    assert.equal(new URL(page.url()).pathname, '/existing/panel');
  }
  await page.locator('#discardChanges').click();
});

test('KV write failures leave edits dirty and permit retry', async t => {
  const { page, binding, go } = await app(t);
  const put = binding.put; binding.put = async () => { throw new Error('simulated KV failure'); };
  await go('#config'); await page.locator('#et').uncheck();
  await page.locator('#saveConfig').click();
  await page.waitForFunction(() => document.getElementById('toast').classList.contains('error'));
  assert.equal(await page.locator('#et').isChecked(), false);
  await dirtyCount(page, 1);
  assert.equal(await page.locator('#saveConfig').isEnabled(), true);
  assert.equal(JSON.parse(binding.data.get('c')).et, undefined);
  binding.put = put; await save(page);
  assert.equal(JSON.parse(binding.data.get('c')).et, 'no');
});

test('ECH requires TLS; the final protocol cannot be disabled', async t => {
  const { page, go, requests } = await app(t, { env: { dkby: 'no' } });
  await go('#config'); await page.locator('#et').uncheck(); await page.locator('#ev').click();
  assert.equal(await page.locator('#ev').isChecked(), true);
  await page.locator('#ech').check();
  assert.equal(await page.locator('#dkby').inputValue(), 'yes');
  assert.equal(await page.locator('#dkby').isDisabled(), true);
  await save(page);
  assert.deepEqual(requests.find(request => request.method === 'POST').body, { et: 'no', ech: 'yes', dkby: 'yes' });
});

test('reset restores environment path and clears jk/ena along with other known overrides', async t => {
  const { page, go, binding } = await app(t, { stored: { jk: 'yes', ena: 'yes' }, env: { s: 'envuser:envpass@env.example:1080' } });
  await go('#advanced'); page.once('dialog', dialog => dialog.accept());
  await page.locator('#resetConfig').click();
  await page.waitForURL('**/env/panel#advanced');
  await page.waitForFunction(() => document.getElementById('saveState').textContent === '所有更改已保存');
  assert.deepEqual(JSON.parse(binding.data.get('c')), {});
  assert.equal(await page.locator('#s').inputValue(), 'envuser:envpass@env.example:1080');
  assert.equal(await page.locator('#jk').isChecked(), false);
  assert.equal(await page.locator('#ena').isChecked(), false);
});

test('without KV, real environment values remain visible and configuration is read-only', async t => {
  const { page, go, origin } = await app(t, { kv: false, env: { s: 'envuser:envpass@proxy.example:1080', qj: 'only', et: 'no', ex: 'yes' } });
  await go('#config');
  assert.equal(await page.locator('#s').inputValue(), 'envuser:envpass@proxy.example:1080');
  assert.equal(await page.locator('#s').isDisabled(), true);
  assert.equal(await page.locator('#ex').isChecked(), true);
  assert.equal(await page.locator('#saveConfig').isDisabled(), true);
  assert.equal(await page.locator('#subscriptionUrl').inputValue(), origin + '/env/panel/sub?target=clash');
});

test('copy, rejected clipboard and configuration downloads report correct results', async t => {
  const { page, go, origin } = await app(t);
  await go(); await page.locator('#copySubscription').click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), origin + '/existing/panel/sub?target=clash');
  await page.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('denied'); }; });
  await page.locator('#copySubscription').click();
  assert.match(await page.locator('#toast').textContent(), /复制失败/);
  const download = page.waitForEvent('download'); await page.locator('#downloadSubscription').click();
  assert.equal((await download).suggestedFilename(), 'cfnew-clash.yaml');
});

test('configuration cannot break out of embedded JSON or execute markup', async t => {
  const injected = '</script><script>window.pwned=1</script><img src=x onerror="window.pwned=2">';
  const { page, go } = await app(t, { stored: { tp: injected } });
  await go('#config');
  assert.equal(await page.locator('#tp').inputValue(), injected);
  assert.equal(await page.evaluate(() => window.pwned), undefined);
});

test('endpoint probe results retain explicit ports and append without silently saving', async t => {
  const { page, go, requests } = await app(t);
  await page.unroute('**/*');
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('.nip.lfree.org')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"colo":"NRT"}', headers: { 'Access-Control-Allow-Origin': '*' } });
    if (url.startsWith('http://127.0.0.1:')) return route.continue();
    return route.abort();
  });
  await go('#preferred'); await page.locator('#probeTargets').fill('192.0.2.1:8443#测试节点');
  await page.locator('#startProbe').click();
  await page.waitForFunction(() => document.getElementById('probeStatus').textContent.includes('测试完成'));
  assert.equal(await page.locator('#probeRows input:checked').count(), 1);
  await page.locator('#appendResults').click();
  assert.match(await page.locator('#yx').inputValue(), /192\.0\.2\.1:8443#测试节点/);
  assert.equal(requests.filter(request => request.method === 'POST').length, 0);
  await save(page);
  assert.match(requests.find(request => request.method === 'POST').body.yx, /:8443#测试节点/);
});

test('endpoint probes retain fastest-ten selection and simultaneous datacenter filters', async t => {
  const { page, go, requests } = await app(t, { mobile: true });
  await page.unroute('**/*');
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname.endsWith('.nip.lfree.org')) {
      const index = Number.parseInt(url.hostname.split('.')[0].slice(-2), 16);
      const colo = ['NRT', 'SIN', 'LAX'][(index - 1) % 3];
      return route.fulfill({ status: index === 13 ? 503 : 200, contentType: 'application/json',
        body: JSON.stringify({ colo }), headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
  });
  await go('#preferred');
  await page.locator('#probeTargets').fill(Array.from({ length: 13 }, (_, index) => `192.0.2.${index + 1}:8443#节点${index + 1}`).join('\n'));
  await page.locator('#startProbe').click();
  await page.waitForFunction(() => document.getElementById('probeStatus').textContent.includes('测试完成'));
  assert.equal(await page.locator('[data-probe-city]').count(), 3);
  assert.equal(await page.locator('#probeRows input:checked').count(), 12);
  const measured = await page.locator('#probeRows tr').evaluateAll(rows => rows.filter(row => !row.querySelector('input').disabled)
    .map(row => ({ index: Number(row.querySelector('input').dataset.index), latency: Number.parseInt(row.cells[2].textContent) })));
  const fastest = measured.sort((a, b) => a.latency - b.latency).slice(0, 10).map(row => row.index).sort((a, b) => a - b);
  await page.locator('#probeFilter').selectOption('fastest10');
  assert.equal(await page.locator('#probeRows tr:visible').count(), 10);
  assert.deepEqual(await page.locator('#probeRows input:checked').evaluateAll(inputs => inputs.map(input => Number(input.dataset.index)).sort((a, b) => a - b)), fastest);
  assert.equal(await page.locator('[data-probe-city="NRT"]').isDisabled(), true);
  await page.locator('#probeFilter').selectOption('');
  assert.equal(await page.locator('#probeRows tr:visible').count(), 13);
  assert.equal(await page.locator('#probeRows input:checked').count(), 12);
  await page.locator('[data-probe-city="LAX"]').uncheck();
  assert.equal(await page.locator('#probeRows tr:visible').count(), 8);
  assert.equal(await page.locator('#probeRows input:checked').count(), 8);
  assert.deepEqual(await page.locator('#probeRows tr:visible').evaluateAll(rows => [...new Set(rows.map(row => row.dataset.colo))].sort()), ['NRT', 'SIN']);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.locator('#replaceResults').click();
  assert.equal((await page.locator('#yx').inputValue()).split(',').length, 8);
  assert.equal(requests.filter(request => request.method === 'POST').length, 0);
  await page.locator('[data-probe-city="NRT"]').uncheck();
  await page.locator('[data-probe-city="SIN"]').uncheck();
  assert.equal(await page.locator('#probeRows tr:visible').count(), 13);
  assert.equal(await page.locator('#probeRows input:checked').count(), 0);
  await page.locator('#discardChanges').click();
});

test('endpoint URL imports merge multiple sources and ignore comments while preserving JSON IPv6 nodes', async t => {
  const { page, go, requests } = await app(t);
  const sources = [];
  await page.unroute('**/*');
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'fixtures.example') {
      sources.push(url.pathname);
      return route.fulfill({ status: 200, contentType: url.pathname === '/one' ? 'text/plain' : 'application/json',
        body: url.pathname === '/one'
          ? ' # ignored header\n192.0.2.1:8443#first,edge.example:2087#edge\r\n\n# ignored footer'
          : JSON.stringify(['192.0.2.1:8443#first', { ip: '2001:db8::1', port: 2053, name: 'IPv6' }]),
        headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    return url.hostname === '127.0.0.1' ? route.continue() : route.abort();
  });
  await go('#preferred');
  await page.locator('#ipSource').selectOption('url');
  await page.locator('#probeSourceUrl').fill('https://fixtures.example/one, https://fixtures.example/two, https://fixtures.example/one');
  await page.locator('#fetchIPs').click();
  await page.waitForFunction(() => document.getElementById('toast').textContent.includes('地址已读取'));
  assert.deepEqual(sources, ['/one', '/two']);
  assert.deepEqual((await page.locator('#probeTargets').inputValue()).split('\n'), ['192.0.2.1:8443#first', 'edge.example:2087#edge', '[2001:db8::1]:2053#IPv6']);
  assert.equal(requests.filter(request => request.method === 'POST').length, 0);
});

for (const [label, options] of [['desktop', {}], ['mobile', { mobile: true }], ['persian-mobile', { mobile: true, fa: true }]]) {
  test(`${label}: all panels fit viewport and remain usable`, async t => {
    const { page, go } = await app(t, options); await go();
    if (fontCSS && !options.fa) { await page.addStyleTag({ content: fontCSS }); await page.evaluate(() => document.fonts.ready); }
    await page.waitForFunction(() => document.getElementById('regionMetric').textContent !== '—');
    for (const panel of ['subscription', 'config', 'preferred', 'advanced']) {
      await page.locator(`[data-nav="${panel}"]`).click();
      assert.equal(await page.locator('[data-panel]:visible').count(), 1);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
      const ids = await page.locator('[id]').evaluateAll(elements => elements.map(element => element.id));
      assert.equal(new Set(ids).size, ids.length);
      if (process.env.CFNEW_SCREENSHOT_DIR && (panel === 'subscription' || label === 'desktop' && panel === 'config')) {
        await mkdir(process.env.CFNEW_SCREENSHOT_DIR, { recursive: true });
        await page.screenshot({ path: resolve(process.env.CFNEW_SCREENSHOT_DIR, `${label}-${panel}.png`), fullPage: true });
        if (label === 'desktop' && panel === 'subscription') {
          await page.screenshot({ path: resolve(process.env.CFNEW_SCREENSHOT_DIR, 'desktop-preview.png'), fullPage: false });
        }
      }
    }
    await page.locator('[data-nav="subscription"]').click(); await page.locator('#themeToggle').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
  });
}

test('public entry page verifies existing credentials and does not reveal custom paths', async t => {
  const { page, origin } = await app(t);
  await page.goto(origin + '/');
  assert.ok(!(await page.content()).includes('/existing/panel'));
  await page.locator('#credential').fill('/wrong/path'); await page.locator('#connectButton').click();
  await page.locator('#connectError').waitFor({ state: 'visible' });
  await page.locator('#credential').fill('/existing/panel'); await page.locator('#connectButton').click();
  await page.waitForURL('**/existing/panel');
  assert.equal(await page.locator('#pageTitle').textContent(), '订阅中心');
  assert.equal(UUID.length, 36);
});
