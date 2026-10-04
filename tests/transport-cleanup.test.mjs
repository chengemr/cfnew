import assert from 'node:assert/strict';
import test from 'node:test';
import { ORIGIN, environment, loadWorker } from './helpers/worker.mjs';
import { flush, xhttpRequest, vlessHeader, websocketRuntime, context } from './helpers/transports.mjs';
import { createXHTTPRelay } from '../src/transports/streams.js';

function socketFactory(reply) {
  const sockets = [];
  return { sockets, connect() {
    let controller;
    let resolveClosed;
    const socket = {
      opened: Promise.resolve(), closes: 0, writes: [],
      closed: new Promise(resolve => { resolveClosed = resolve; }),
      readable: new ReadableStream({ start(value) {
        controller = value;
        if (reply) controller.enqueue(reply.slice());
      } }),
      writable: new WritableStream({ write(value) { socket.writes.push(value.slice()); } }),
      send(value) { controller.enqueue(value); },
      end() { try { controller.close(); } catch {} resolveClosed(); },
      close() { this.closes++; this.end(); }
    };
    sockets.push(socket);
    return socket;
  } };
}

test('a rejected SOCKS handshake closes the socket and releases both locks', async t => {
  const remote = socketFactory(Uint8Array.of(5, 255));
  const { worker } = await loadWorker(t, { connect: remote.connect });
  const response = await worker.fetch(xhttpRequest(),
    environment({ qj: 'only', s: 'proxy.example:1080' }), context);
  assert.equal(response.status, 500);
  const socket = remote.sockets[0];
  t.after(() => socket.end());
  assert.equal(socket.closes, 1);
  assert.equal(socket.readable.locked, false);
  assert.equal(socket.writable.locked, false);
});

test('normal WebSocket close releases an established outbound socket', async t => {
  const runtime = websocketRuntime();
  const remote = socketFactory();
  const { worker } = await loadWorker(t, { globals: runtime.globals, connect: remote.connect });
  await worker.fetch(new Request(ORIGIN, { headers: { Upgrade: 'websocket' } }),
    environment({ ex: 'no' }), context);
  const websocket = runtime.pairs[0][1];
  websocket.receive(vlessHeader());
  for (let i = 0; i < 5; i++) await flush();
  const socket = remote.sockets.find(item => !item.closes);
  t.after(() => remote.sockets.forEach(item => item.end()));
  // Complete the first-byte stage, so its fallback timer cannot mask a leak.
  socket.send(Uint8Array.of(42));
  await flush();
  websocket.close();
  for (let i = 0; i < 5; i++) await flush();
  assert.equal(socket.closes, 1);
  assert.equal(socket.readable.locked, false);
  assert.equal(socket.writable.locked, false);
});

test('XHTTP upload write failure cancels the unfinished inbound body', async () => {
  let canceled = false;
  const body = new ReadableStream({ type: 'bytes', cancel() { canceled = true; } });
  let download;
  const socket = {
    readable: new ReadableStream({ start(controller) { download = controller; } }),
    writable: new WritableStream({ write() { throw new Error('fixture write failure'); } }),
    close() { try { download.close(); } catch {} }
  };
  const relay = createXHTTPRelay({ resp: Uint8Array.of(0, 0), data: Uint8Array.of(42),
    reader: body.getReader({ mode: 'byob' }), done: false }, socket);
  await relay.closed;
  assert.equal(canceled, true);
  assert.equal(body.locked, false);
  assert.equal(socket.readable.locked, false);
  assert.equal(socket.writable.locked, false);
});

const vlessPrefix = vlessHeader().slice(0, 21);
const addresses = [
  { name: 'IPv4', bytes: Uint8Array.of(1, 192, 0, 2, 10) },
  { name: 'IPv6', bytes: Uint8Array.of(3, 0x20, 1, 0x0d, 0xb8, ...Array(12).fill(0)) },
  { name: 'domain', bytes: Uint8Array.of(2, 11, ...new TextEncoder().encode('example.com')) }
];

for (const { name, bytes } of addresses) {
  test(`truncated XHTTP ${name} address opens no outbound socket`, async t => {
    const attempts = [];
    const { worker } = await loadWorker(t, { connect(target) {
      attempts.push(target);
      throw new Error('unexpected outbound connection');
    } });
    const packet = Uint8Array.of(...vlessPrefix, ...bytes.slice(0, -1));
    const input = xhttpRequest(packet);
    const response = await worker.fetch(input, environment(), context);
    assert.equal(response.status, 500);
    assert.deepEqual(attempts, []);
    assert.equal(input.body.locked, false);
  });
}
