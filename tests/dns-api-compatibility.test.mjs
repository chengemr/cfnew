import assert from 'node:assert/strict';
import test from 'node:test';
import { UUID, environment, loadWorker, mockKV, request } from './helpers/worker.mjs';

test('configuration API preserves all existing DNS endpoint formats', async t => {
  const { worker } = await loadWorker(t);
  const C = mockKV();
  const env = environment({ C, yx: 'example.com:8443' });
  for (const customDNS of ['https://dns.example/provider/v1?secure=1', 'h3://dns.example:8443/provider/dns',
    'tls://dns.example:8853', 'quic://[2001:db8::1]:8853', 'udp://1.1.1.1:5353',
    'dns://[2001:db8::1]:5353', 'dns.example:5353', '[2001:db8::1]:5353', '2001:db8::1']) {
    const response = await request(worker, env, `/${UUID}/api/config`, {
      method: 'POST', body: JSON.stringify({ customDNS })
    });
    assert.equal(response.status, 200, customDNS);
    assert.equal((await response.json()).config.customDNS, customDNS);
    const subscription = await request(worker, env, `/${UUID}/sub?target=singbox`);
    assert.equal(subscription.status, 200);
    assert.ok((await subscription.json()).dns.servers.length > 0);
  }
});
