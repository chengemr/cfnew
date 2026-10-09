import assert from 'node:assert/strict';
import test from 'node:test';
import { parse } from 'yaml';
import { UUID, environment, loadWorker, request } from './helpers/worker.mjs';

async function clash(worker, overrides = {}, target = 'clash') {
  const response = await request(worker, environment({ yx: 'example.com:8443', ...overrides }),
    `/${UUID}/sub?target=${target}`);
  assert.equal(response.status, 200);
  const text = await response.text();
  return { text, config: parse(text) };
}

for (const target of ['clash', 'clashr', 'stash', 'meta', 'clashmeta']) {
  test(`${target}: direct domain DNS is independent of website DNS and policy`, async t => {
    const { worker } = await loadWorker(t);
    const { config } = await clash(worker, { customDNS: 'https://dns.example/dns-query' }, target);
    assert.deepEqual(config.dns['direct-nameserver'], [
      'https://223.5.5.5/dns-query', 'https://119.29.29.29/dns-query'
    ]);
    assert.equal(config.dns['direct-nameserver-follow-policy'], false);
    assert.equal(config.dns.nameserver[0], 'https://dns.example/dns-query');
    assert.deepEqual(config.dns.fallback, ['https://1.1.1.1/dns-query', 'https://8.8.8.8/dns-query']);
    assert.equal(config.dns['fallback-filter'].geoip, true);
    assert.equal(config.dns.ipv6, true);
  });

  test(`${target}: image CDN uses dedicated DNS without changing global fallback`, async t => {
    const { worker } = await loadWorker(t);
    const { config } = await clash(worker, { customDNS: 'https://dns.example/dns-query' }, target);
    assert.deepEqual(config.dns['nameserver-policy']['+.hdslb.com'], [
      'https://223.5.5.5/dns-query', 'https://119.29.29.29/dns-query'
    ]);
    assert.equal(config.dns.nameserver[0], 'https://dns.example/dns-query');
    assert.deepEqual(config.dns.fallback, ['https://1.1.1.1/dns-query', 'https://8.8.8.8/dns-query']);
    assert.equal(config.dns['fallback-filter'].geoip, true);
    assert.equal(config.dns.ipv6, true);
    assert.ok(config.rules.includes('DOMAIN-SUFFIX,hdslb.com,📺 哔哩哔哩'));
  });

  test(`${target}: proxy domain bootstrap is independent of custom website DNS and fallback`, async t => {
    const { worker } = await loadWorker(t);
    const { config } = await clash(worker, { customDNS: 'https://dns.example/dns-query' }, target);
    assert.deepEqual(config.dns['proxy-server-nameserver'], [
      'https://223.5.5.5/dns-query', 'https://119.29.29.29/dns-query'
    ]);
    assert.equal(config.dns.nameserver[0], 'https://dns.example/dns-query');
    assert.deepEqual(config.dns.fallback, ['https://1.1.1.1/dns-query', 'https://8.8.8.8/dns-query']);
    assert.equal(config.dns['fallback-filter']['geoip-code'], 'CN');
    assert.equal(config.dns.ipv6, true);
  });
}

test('initial proxy choice follows node order while domestic groups keep direct defaults', async t => {
  const { worker } = await loadWorker(t);
  const { config } = await clash(worker);
  const groups = new Map(config['proxy-groups'].map(group => [group.name, group.proxies]));
  const names = config.proxies.map(node => node.name);
  assert.deepEqual(groups.get('🚀 节点选择'), [...names, '🎯 全球直连']);
  assert.equal(groups.get('📺 哔哩哔哩')[0], '🎯 全球直连');
  assert.equal(groups.get('🍎 苹果服务')[0], '🎯 全球直连');
  assert.equal(groups.get('🌍 国外媒体')[0], '🚀 节点选择');
});

test('upstream policy groups retain their names, choices and domestic defaults', async t => {
  const { worker } = await loadWorker(t);
  const { config } = await clash(worker);
  const groups = new Map(config['proxy-groups'].map(group => [group.name, group.proxies]));
  const names = config.proxies.map(node => node.name);
  assert.deepEqual([...groups.keys()], [
    '🚀 节点选择', '🌍 国外媒体', '📺 哔哩哔哩', '📹 油管视频',
    '🎬 奈飞视频', '📲 电报信息', '🌐 谷歌服务', '🤖 OpenAI',
    'Ⓜ️ 微软服务', '🍎 苹果服务', '🎯 全球直连', '🛑 全球拦截',
    '🍃 应用净化', '🐟 漏网之鱼'
  ]);
  assert.deepEqual(groups.get('Ⓜ️ 微软服务'), ['🎯 全球直连', '🚀 节点选择', ...names]);
  assert.deepEqual(groups.get('🍃 应用净化'), ['REJECT', 'DIRECT']);
});

test('all references resolve and no group cycle exists, preserving upstream compatibility groups', async t => {
  const { worker } = await loadWorker(t);
  const { config } = await clash(worker);
  const groups = new Map(config['proxy-groups'].map(group => [group.name, group.proxies]));
  const known = new Set([...groups.keys(), ...config.proxies.map(node => node.name), 'DIRECT', 'REJECT']);
  const targets = config.rules.map(rule => {
    const parts = rule.split(',');
    return parts.at(-1) === 'no-resolve' ? parts.at(-2) : parts.at(-1);
  });
  const used = new Set([...targets, ...[...groups.values()].flat()]);
  // Upstream exposes these groups for client-side custom rules even though its
  // built-in rules do not select them. Preserve that public configuration surface.
  const compatibleUnused = new Set(['Ⓜ️ 微软服务', '🍃 应用净化']);
  for (const name of groups.keys()) assert.ok(used.has(name) || compatibleUnused.has(name), `unused group: ${name}`);
  for (const name of used) assert.ok(known.has(name), `unresolved reference: ${name}`);
  function visit(name, path = []) {
    assert.ok(!path.includes(name), `group cycle: ${[...path, name].join(' -> ')}`);
    for (const child of groups.get(name) ?? []) {
      if (groups.has(child)) visit(child, [...path, name]);
    }
  }
  for (const name of groups.keys()) visit(name);
});

test('144 nodes reuse YAML lists and retain every business group selection in order', async t => {
  const { worker } = await loadWorker(t);
  const yx = Array.from({ length: 48 }, (_, index) => `node-${index}.example:8443`).join(',');
  const { config, text } = await clash(worker, { yx });
  const names = config.proxies.map(node => node.name);
  assert.equal(names.length, 144);
  const selections = text.split('\nproxy-groups:\n')[1].split('\nrule-providers:\n')[0];
  const literals = [...selections.matchAll(/^      - "优选域名-\d+"$/gm)].length;
  assert.ok(literals <= names.length * 4, `repeated ${literals} node references`);
  assert.ok(/proxies: \*[a-zA-Z]/.test(selections), 'missing reusable YAML list');
  for (const group of config['proxy-groups']) {
    if (!group.proxies.some(name => names.includes(name))) continue;
    assert.deepEqual(group.proxies.filter(name => names.includes(name)), names, group.name);
  }
});
