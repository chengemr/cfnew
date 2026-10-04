import assert from 'node:assert/strict';
import test from 'node:test';
import { environment, loadWorker } from './helpers/worker.mjs';
import { xhttpRequest, vlessHeader } from './helpers/transports.mjs';

const ipv6Packet = Uint8Array.of(...vlessHeader().slice(0, 21), 3,
  0x20, 1, 0x0d, 0xb8, ...Array(11).fill(0), 1);

for (const proxy of ['socks5://user:pass@proxy.example:1080', 'http://user:pass@proxy.example:8080', 'https://user:pass@proxy.example:443']) {
  test(`${proxy.split('://')[0]} fragmented handshake preserves IPv6 target and first download bytes`, async t => {
    let incoming;
    let resolveClosed;
    const writes = [];
    const destinations = [];
    const socket = {
      opened: Promise.resolve(), closed: new Promise(resolve => { resolveClosed = resolve; }),
      readable: new ReadableStream({ start(controller) { incoming = controller; } }),
      writable: new WritableStream({ write(data) {
        writes.push(data.slice());
        let reply;
        if (proxy.startsWith('socks5://')) {
          if (writes.length === 1) reply = Uint8Array.of(5, 2);
          else if (writes.length === 2) reply = Uint8Array.of(1, 0);
          else reply = Uint8Array.of(5, 0, 0, 1, 127, 0, 0, 1, 0, 80, 42, 43);
        } else reply = Uint8Array.of(...new TextEncoder().encode('HTTP/1.1 200 Connection established\r\n\r\n'), 42, 43);
        incoming.enqueue(reply.slice(0, 1));
        queueMicrotask(() => incoming.enqueue(reply.slice(1)));
      } }),
      close() { try { incoming.close(); } catch {} resolveClosed(); }
    };
    const tasks = [];
    const { worker } = await loadWorker(t, { connect(destination, options) {
      destinations.push({ destination, options }); return socket;
    } });
    const response = await worker.fetch(xhttpRequest(ipv6Packet), environment({ qj: 'only', s: proxy }),
      { waitUntil(task) { tasks.push(task); } });
    assert.equal(response.status, 200);
    const reader = response.body.getReader();
    t.after(async () => {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
      socket.close();
      await Promise.allSettled(tasks);
    });
    assert.deepEqual([...((await reader.read()).value)], [0, 0]);
    assert.deepEqual([...((await reader.read()).value)], [42, 43]);
    assert.equal(destinations.length, 1);
    assert.equal(destinations[0].destination.hostname, 'proxy.example');
    if (proxy.startsWith('socks5://')) {
      assert.deepEqual([...writes[0]], [5, 2, 0, 2]);
      const target = new TextDecoder().decode(writes[2].slice(5, -2));
      assert.equal(target, '2001:db8:0:0:0:0:0:1');
      assert.deepEqual([...writes[2].slice(-2)], [1, 187]);
    } else {
      const request = new TextDecoder().decode(writes[0]);
      assert.ok(request.startsWith('CONNECT [2001:db8:0:0:0:0:0:1]:443 HTTP/1.1\r\n'));
      assert.ok(request.includes('Proxy-Authorization: Basic dXNlcjpwYXNz\r\n'));
      if (proxy.startsWith('https://')) assert.equal(destinations[0].options.secureTransport, 'on');
    }
  });
}
