import assert from 'node:assert/strict';
import test from 'node:test';
import { UUID, environment, loadWorker, request } from './helpers/worker.mjs';

const cases = [
  ['https://223.5.5.5/dns-query', { type: 'https', server: '223.5.5.5' }],
  ['https://dns.example:8443/provider/v1/dns-query?token=fixture%2Fvalue&mode=secure',
    { type: 'https', server: 'dns.example', server_port: 8443,
      path: '/provider/v1/dns-query?token=fixture%2Fvalue&mode=secure' }],
  ['https://dns.example/dns-query?mode=secure',
    { type: 'https', server: 'dns.example', path: '/dns-query?mode=secure' }],
  ['https://[2001:db8::1]:8443/custom/dns?mode=secure',
    { type: 'https', server: '2001:db8::1', server_port: 8443, path: '/custom/dns?mode=secure' }],
  ['tls://dns.example:8853', { type: 'tls', server: 'dns.example', server_port: 8853 }],
  ['quic://[2001:db8::1]:8853', { type: 'quic', server: '2001:db8::1', server_port: 8853 }],
  ['udp://1.1.1.1:5353', { type: 'udp', server: '1.1.1.1', server_port: 5353 }],
  ['dns://[2001:db8::1]:5353', { type: 'udp', server: '2001:db8::1', server_port: 5353 }],
  ['dns.example:5353', { type: 'udp', server: 'dns.example', server_port: 5353 }],
  ['[2001:db8::1]:5353', { type: 'udp', server: '2001:db8::1', server_port: 5353 }],
  ['2001:db8::1', { type: 'udp', server: '2001:db8::1' }],
  ['h3://dns.example:8443/provider/dns',
    { type: 'https', server: 'dns.example', server_port: 8443, path: '/provider/dns' }]
];

for (const [dns, expected] of cases) {
  test(`Sing-box preserves DNS endpoint host, port and path: ${dns}`, async t => {
    const { worker } = await loadWorker(t);
    const response = await request(worker, environment({ yx: 'example.com:8443', customDNS: dns }),
      `/${UUID}/sub?target=singbox`);
    assert.equal(response.status, 200);
    const config = await response.json();
    assert.deepEqual(config.dns.servers[0], { ...expected, tag: 'remote', detour: 'select' });
    assert.deepEqual(config.route.default_domain_resolver, { server: 'local' });
  });
}
