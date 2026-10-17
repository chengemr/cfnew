import assert from 'node:assert/strict';
import test from 'node:test';
import { UUID, environment, loadWorker, request } from './helpers/worker.mjs';

const targets = { surge: 'Surge', loon: 'Loon', quanx: 'Quantumult X' };
const nodeSettings = { yx: 'edge.example:443', ev: 'no', et: 'yes', ex: 'no' };

async function profile(worker, target, customDNS) {
  return request(worker, environment({ ...nodeSettings, ...(customDNS === undefined ? {} : { customDNS }) }),
    `/${UUID}/sub?target=${target}`);
}

function dnsFields(text) {
  return Object.fromEntries(text.split('\n').filter(line => /^(?:dns-server|encrypted-dns-server|doh-server|doh3-server|doq-server)\s*=/.test(line))
    .map(line => line.split(/\s*=\s*(.*)/s).slice(0, 2)));
}

const udpCases = [
  ['1.1.1.1', '1.1.1.1'],
  ['1.1.1.1:5353', '1.1.1.1:5353'],
  ['udp://1.1.1.1:5353', '1.1.1.1:5353'],
  ['dns.example:5353', 'dns.example:5353'],
  ['2001:db8::1', '[2001:db8::1]'],
  ['[2001:db8::1]:5353', '[2001:db8::1]:5353'],
  ['udp://[2001:db8::1]:5353', '[2001:db8::1]:5353'],
  ['dns://[2001:db8::1]:5353', '[2001:db8::1]:5353']
];

for (const [target, client] of Object.entries(targets)) {
  test(`${client}: DoH keeps its IPv6 host, port, path and query in the encrypted DNS field`, async t => {
    const { worker } = await loadWorker(t);
    const endpoint = 'https://[2001:db8::1]:8443/provider/v1/dns-query?token=a%2Fb&mode=secure';
    const response = await profile(worker, target, endpoint);
    assert.equal(response.status, 200);
    const text = await response.text();
    const fields = dnsFields(text);
    const key = target === 'surge' ? 'encrypted-dns-server' : 'doh-server';
    assert.equal(fields[key], endpoint + ', https://1.12.12.12/dns-query');
    assert.ok(!/^server\s*=\s*https:\/\//m.test(text), 'DoH URLs must not use the plain UDP server field');
    assert.ok(!fields['dns-server']?.includes('2001:db8::1'), 'the DoH host must not become a UDP resolver');
  });

  test(`${client}: UDP and bare DNS endpoints retain their address family and custom port`, async t => {
    const { worker } = await loadWorker(t);
    for (const [endpoint, expected] of udpCases) {
      const response = await profile(worker, target, endpoint);
      assert.equal(response.status, 200, endpoint);
      const text = await response.text();
      if (target === 'quanx') assert.ok(text.split('\n').includes('server=' + expected), endpoint);
      else assert.equal(dnsFields(text)['dns-server'].split(',')[0], expected, endpoint);
      assert.ok(!/^(?:encrypted-dns-server|doh-server|doh3-server|doq-server)\s*=/m.test(text),
        'an explicit UDP resolver must not be superseded by hardcoded encrypted resolvers');
    }
  });

  test(`${client}: default DoH and bootstrap resolvers remain available`, async t => {
    const { worker } = await loadWorker(t);
    const response = await profile(worker, target);
    assert.equal(response.status, 200);
    const text = await response.text();
    const fields = dnsFields(text);
    assert.equal(fields[target === 'surge' ? 'encrypted-dns-server' : 'doh-server'],
      'https://223.5.5.5/dns-query, https://1.12.12.12/dns-query');
    if (target === 'quanx') {
      assert.ok(text.includes('server=223.5.5.5\nserver=119.29.29.29'));
    } else {
      assert.equal(fields['dns-server'], target === 'surge'
        ? '223.5.5.5, 119.29.29.29, system' : '223.5.5.5,119.29.29.29,system');
    }
  });

  test(`${client}: QUIC uses the client's encrypted field and keeps explicit ports`, async t => {
    const { worker } = await loadWorker(t);
    for (const endpoint of ['quic://dns.example:8853', 'quic://[2001:db8::1]:784']) {
      const response = await profile(worker, target, endpoint);
      assert.equal(response.status, 200);
      assert.equal(dnsFields(await response.text())[target === 'surge' ? 'encrypted-dns-server' : 'doq-server'], endpoint);
    }
    const response = await profile(worker, target, 'quic://dns.example');
    assert.equal(response.status, 200);
    const expected = target === 'loon' ? 'quic://dns.example:853' : 'quic://dns.example';
    assert.equal(dnsFields(await response.text())[target === 'surge' ? 'encrypted-dns-server' : 'doq-server'], expected);
  });

  test(`${client}: HTTP/3 is explicitly selected without dropping the custom endpoint`, async t => {
    const { worker } = await loadWorker(t);
    for (const scheme of ['h3', 'http3']) {
      const response = await profile(worker, target, `${scheme}://dns.example:8443/provider/dns?mode=secure`);
      assert.equal(response.status, 200);
      const text = await response.text();
      const fields = dnsFields(text);
      if (target === 'quanx') {
        assert.ok(text.split('\n').includes('prefer-doh3'));
        assert.equal(fields['doh-server'], 'https://dns.example:8443/provider/dns?mode=secure, https://1.12.12.12/dns-query');
      } else {
        assert.equal(fields[target === 'surge' ? 'encrypted-dns-server' : 'doh3-server'],
          'h3://dns.example:8443/provider/dns?mode=secure');
      }
    }
  });

  test(`${client}: unsupported DNS protocols return an explicit compatibility error`, async t => {
    const { worker } = await loadWorker(t);
    const endpoints = ['http://dns.example:8080/dns-query', 'tcp://dns.example:5353',
      ...(target === 'surge' ? [] : ['tls://dns.example:8853'])];
    for (const endpoint of endpoints) {
      const response = await profile(worker, target, endpoint);
      assert.equal(response.status, 422, endpoint);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.match(await response.text(), /不支持 .* DNS.*Clash \/ Sing-box/);
    }
  });

  test(`${client}: invalid DNS addresses fail before emitting a broken configuration`, async t => {
    const { worker } = await loadWorker(t);
    for (const endpoint of ['udp://1.1.1.1:65536', 'dns.example:0', 'udp://1.1.1.1/path',
      'https://dns.example/dns-query#fragment', 'https://dns.example/dns-query,extra',
      'foo%2cbar.example', 'udp://foo%2cbar.example:53', 'https://foo%2cbar.example/dns-query',
      'https://dns.example/dns-query\nserver=1.1.1.1', 'not a host']) {
      const response = await profile(worker, target, endpoint);
      assert.equal(response.status, 422, endpoint);
      assert.match(await response.text(), /DNS 地址/);
    }
  });
}

test('Surge: TLS DNS preserves its protocol, IPv6 host and custom port', async t => {
  const { worker } = await loadWorker(t);
  const endpoint = 'tls://[2001:db8::1]:8853';
  const response = await profile(worker, 'surge', endpoint);
  assert.equal(response.status, 200);
  assert.equal(dnsFields(await response.text())['encrypted-dns-server'], endpoint);
});
