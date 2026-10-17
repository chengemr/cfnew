import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { ORIGIN, UUID, environment, loadWorker } from './helpers/worker.mjs';
import { flush, vlessHeader, websocketRuntime, tlsClientHello } from './helpers/transports.mjs';
import { timerRuntime } from './helpers/timers.mjs';

const limit = 256 * 1024;
const hello = tlsClientHello({ records: [2, 7] });
const joined = chunks => Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
const settle = async () => { for (let i = 0; i < 5; i++) await flush(); };
const firstPacket = (payload, trojan = false) => trojan
  ? Uint8Array.of(...new TextEncoder().encode(createHash('sha224').update(UUID).digest('hex')),
    13, 10, 1, 1, 192, 0, 2, 10, 1, 187, 13, 10, ...payload)
  : Uint8Array.of(...vlessHeader(), ...payload);

async function session(t, { pendingFallback = false, stallPrimaryWrite = false, rejectPrimaryPayload = false, trojan = false } = {}) {
  const runtime = websocketRuntime(), timers = timerRuntime(), sockets = [];
  let openFallback;
  const opening = new Promise(resolve => { openFallback = resolve; });
  const { worker } = await loadWorker(t, {
    globals: { ...runtime.globals, ...timers.globals },
    connect(target) {
      let incoming, closed, rejectWrite, resolveWrite;
      const fallback = target.hostname === 'fallback.example';
      const socket = {
        target, closes: 0, writes: [], started: [],
        opened: fallback && pendingFallback ? opening : Promise.resolve(),
        closed: new Promise(resolve => { closed = resolve; }),
        readable: new ReadableStream({ start(controller) { incoming = controller; } }),
        writable: new WritableStream({ async write(data) {
          socket.started.push(data.slice());
          if (!fallback && rejectPrimaryPayload) throw new Error('TLS write failed after possible delivery');
          if (!fallback && stallPrimaryWrite && socket.started.length > 1) {
            await new Promise((resolve, reject) => { resolveWrite = resolve; rejectWrite = reject; });
          }
          socket.writes.push(data.slice());
        } }),
        reply(data) { incoming.enqueue(data.slice()); },
        rejectWrite() { rejectWrite?.(new Error('old socket write failed')); },
        resolveWrite() { resolveWrite?.(); },
        close() {
          this.closes++;
          try { incoming.close(); } catch {}
          closed();
        }
      };
      sockets.push(socket);
      return socket;
    }
  });
  await worker.fetch(new Request(ORIGIN, { headers: { Upgrade: 'websocket' } }),
    environment({ p: 'fallback.example:443', ev: trojan ? 'no' : 'yes', et: trojan ? 'yes' : 'no', ex: 'no' }),
    { waitUntil() {} });
  const ws = runtime.pairs[0][1];
  const received = [];
  ws.send = data => received.push(data.slice());
  const primary = () => sockets.find(socket => socket.target.hostname === '192.0.2.10' && !socket.closes);
  const fallback = () => sockets.find(socket => socket.target.hostname === 'fallback.example' && !socket.closes);
  t.after(async () => {
    openFallback();
    ws.close();
    sockets.forEach(socket => { socket.rejectWrite(); socket.close(); });
    await settle();
    assert.equal(timers.pending.size, 0);
    assert.ok(sockets.every(socket => !socket.readable.locked && !socket.writable.locked));
  });
  return { ws, timers, sockets, primary, fallback, openFallback, received };
}

for (const trojan of [false, true]) {
  test(`${trojan ? 'Trojan' : 'VLESS'} first-byte retry replays a fragmented ClientHello from every WS message`, async t => {
    const { ws, timers, primary, fallback } = await session(t, { trojan });
    ws.receive(firstPacket(hello.subarray(0, 12), trojan));
    await settle();
    const original = primary();
    ws.receive(hello.subarray(12));
    await settle();
    assert.deepEqual(joined(original.writes), Buffer.from(hello));
    await timers.tick(3_500);
    await settle();
    assert.deepEqual(joined(fallback().writes), Buffer.from(hello));
    assert.equal(ws.readyState, 1);
  });
}

test('a header-only first WS message replays a later complete ClientHello', async t => {
  const { ws, timers, fallback } = await session(t);
  ws.receive(vlessHeader());
  await settle();
  ws.receive(hello.subarray(0, 5));
  ws.receive(hello.subarray(5));
  await settle();
  await timers.tick(3_500);
  await settle();
  assert.deepEqual(joined(fallback().writes), Buffer.from(hello));
});

test('messages arriving during the retry dial follow the replay exactly once', async t => {
  const { ws, timers, fallback, openFallback } = await session(t, { pendingFallback: true });
  ws.receive(firstPacket(hello));
  await settle();
  await timers.tick(3_500);
  ws.receive(Uint8Array.of(5, 6));
  await settle();
  assert.deepEqual(fallback().writes, []);
  openFallback();
  await settle();
  assert.deepEqual(joined(fallback().writes), Buffer.concat([Buffer.from(hello), Buffer.from([5, 6]) ]));
  ws.receive(Uint8Array.of(7, 8));
  await settle();
  assert.deepEqual(joined(fallback().writes), Buffer.concat([Buffer.from(hello), Buffer.from([5, 6, 7, 8]) ]));
  assert.equal(ws.readyState, 1);
});

test('a stalled old write and queued bytes survive retry and its late rejection', async t => {
  const { ws, timers, primary, fallback } = await session(t, { stallPrimaryWrite: true });
  ws.receive(firstPacket(hello.subarray(0, 5)));
  await settle();
  const original = primary();
  ws.receive(hello.subarray(5, 20));
  await settle();
  ws.receive(hello.subarray(20));
  await settle();
  assert.deepEqual(joined(original.started), Buffer.from(hello.subarray(0, 20)));
  await timers.tick(3_500);
  await settle();
  assert.deepEqual(joined(fallback().writes), Buffer.from(hello));
  ws.receive(Uint8Array.of(7, 8));
  await settle();
  original.rejectWrite();
  await settle();
  assert.deepEqual(joined(fallback().writes), Buffer.concat([Buffer.from(hello), Buffer.from([7, 8]) ]));
  assert.equal(ws.readyState, 1);
});

test('completed plaintext uploads release retry history and can exceed 256 KiB', async t => {
  const { ws, timers, sockets } = await session(t);
  ws.receive(firstPacket(new Uint8Array(16 * 1024)));
  await settle();
  for (let i = 0; i < 15; i++) {
    ws.receive(new Uint8Array(16 * 1024));
    await settle();
  }
  assert.equal(ws.readyState, 1);
  ws.receive(Uint8Array.of(1));
  await settle();
  assert.equal(ws.readyState, 1);
  await timers.tick(3_500);
  assert.equal(ws.readyState, 1);
  assert.ok(sockets.every(socket => socket.target.hostname === '192.0.2.10'));
  assert.equal(timers.pending.size, 0);
});

test('an in-flight plaintext write retains its byte reservation after the first reply', async t => {
  const { ws, primary, timers } = await session(t, { stallPrimaryWrite: true });
  ws.receive(firstPacket(new Uint8Array(16 * 1024)));
  await settle();
  const socket = primary();
  ws.receive(new Uint8Array(240 * 1024));
  await settle();
  socket.reply(Uint8Array.of(42));
  await settle();
  // Completed plaintext writes were released; the 240 KiB write still owns
  // its reservation while the server has already replied.
  ws.receive(new Uint8Array(16 * 1024 + 1));
  await settle();
  assert.equal(ws.readyState, 3);
  socket.rejectWrite();
  await settle();
  assert.equal(timers.pending.size, 0);
});

test('after the first reply, later uploads release their budget and cannot be retried', async t => {
  const { ws, primary, timers, sockets } = await session(t);
  ws.receive(firstPacket(new Uint8Array(16 * 1024)));
  await settle();
  primary().reply(Uint8Array.of(42));
  await settle();
  for (let i = 0; i < 3; i++) {
    ws.receive(new Uint8Array(limit));
    await settle();
    assert.equal(ws.readyState, 1);
  }
  await timers.tick(3_510);
  assert.equal(ws.readyState, 1);
  assert.ok(sockets.every(socket => socket.target.hostname === '192.0.2.10'));
});

const post = new TextEncoder().encode('POST /increment HTTP/1.1\r\nHost: example\r\nContent-Length: 1\r\n\r\n1');
const applicationRecord = Uint8Array.of(23, 3, 3, 0, 1, 42);
const notReplayable = [
  ['plaintext POST', post],
  ['a truncated TLS record header', hello.subarray(0, 3)],
  ['a truncated ClientHello', hello.subarray(0, -1)],
  ['a non-ClientHello handshake', Uint8Array.of(22, 3, 1, 0, 4, 2, 0, 0, 0)],
  ['a ClientHello offering early_data', tlsClientHello({ earlyData: true })],
  ['a ClientHello followed by application data', Uint8Array.of(...hello, ...applicationRecord)],
  ['an invalid compatibility CCS body', Uint8Array.of(...hello, 20, 3, 3, 0, 1, 2)],
  ['an invalid compatibility CCS length', Uint8Array.of(...hello, 20, 3, 3, 0, 2, 1, 1)],
  ['two compatibility CCS records', Uint8Array.of(...hello, 20, 3, 3, 0, 1, 1, 20, 3, 3, 0, 1, 1)],
  ['compatibility CCS followed by application data', Uint8Array.of(...hello, 20, 3, 3, 0, 1, 1, ...applicationRecord)],
  ['two ClientHello messages', Uint8Array.of(...hello, ...hello)],
  ...[[43, 33, 'an oversized session ID'], [45, 3, 'odd cipher-suite length'],
    [51, 255, 'invalid extension-vector length'], [55, 255, 'invalid extension length']].map(([offset, value, name]) => {
    const bytes = tlsClientHello(); bytes[offset] = value; return [name, bytes];
  })
];
for (const [name, payload] of notReplayable) {
  test(`${name} keeps its original connection and receives a delayed response`, async t => {
    const { ws, timers, sockets, primary, received } = await session(t);
    ws.receive(firstPacket(payload));
    await settle();
    const original = primary();
    await timers.tick(4_500);
    assert.equal(primary(), original);
    assert.ok(sockets.every(socket => socket.target.hostname === '192.0.2.10'));
    assert.deepEqual(joined(original.writes), Buffer.from(payload));
    original.reply(Uint8Array.of(42));
    await settle();
    await timers.tick(10);
    assert.deepEqual([...joined(received)], [0, 0, 42]);
    assert.equal(ws.readyState, 1);
  });
}

for (const trojan of [false, true]) {
  test(`${trojan ? 'Trojan' : 'VLESS'} header-only followed by plaintext never replays the request`, async t => {
    const { ws, timers, primary, fallback } = await session(t, { trojan });
    ws.receive(firstPacket(new Uint8Array(), trojan));
    await settle();
    const original = primary();
    ws.receive(post);
    await settle();
    await timers.tick(4_500);
    assert.equal(primary(), original);
    assert.equal(fallback(), undefined);
    assert.deepEqual(joined(original.writes), Buffer.from(post));
    assert.equal(ws.readyState, 1);
  });
}

test('a later TLS application record disables retry before the timer runs', async t => {
  const { ws, timers, primary, fallback } = await session(t, { stallPrimaryWrite: true });
  ws.receive(firstPacket(hello));
  await settle();
  const original = primary();
  ws.receive(applicationRecord);
  await settle();
  await timers.tick(3_500);
  assert.equal(primary(), original);
  assert.equal(fallback(), undefined);
  assert.equal(ws.readyState, 1);
  original.rejectWrite();
  await settle();
});

test('a ClientHello fragmented into individual bytes remains replayable', async t => {
  const { ws, timers, fallback } = await session(t);
  ws.receive(vlessHeader());
  await settle();
  for (const byte of hello) { ws.receive(Uint8Array.of(byte)); await settle(); }
  await timers.tick(3_500);
  assert.deepEqual(joined(fallback().writes), Buffer.from(hello));
});

test('an empty connection can fall back before its first application write', async t => {
  const { ws, timers, primary, fallback } = await session(t);
  ws.receive(vlessHeader());
  await settle();
  const original = primary();
  await timers.tick(3_500);
  ws.receive(post);
  await settle();
  assert.deepEqual(original.writes, []);
  assert.deepEqual(joined(fallback().writes), Buffer.from(post));
});

test('unsafe remote EOF closes the WS and releases its locks without retry', async t => {
  const { ws, primary, sockets, timers } = await session(t);
  ws.receive(firstPacket(post));
  await settle();
  primary().close();
  await settle();
  assert.equal(ws.readyState, 3);
  assert.ok(sockets.every(socket => socket.target.hostname === '192.0.2.10'));
  assert.equal(timers.pending.size, 0);
});

for (const proxy of ['', 'proxy.example:1080', 'http://proxy.example:8080']) {
  test(`a failed initial application write through ${proxy || 'direct TCP'} is never retried`, async t => {
    const runtime = websocketRuntime(), timers = timerRuntime(), sockets = [], delivered = [];
    const { worker } = await loadWorker(t, { globals: { ...runtime.globals, ...timers.globals }, connect(target) {
      let incoming, closed;
      const socket = {
        opened: Promise.resolve(), closed: new Promise(resolve => { closed = resolve; }),
        readable: new ReadableStream({ start(controller) { incoming = controller; } }),
        writable: new WritableStream({ write(data) {
          if (data[0] === 5 && data.length <= 4) incoming.enqueue(Uint8Array.of(5, 0));
          else if (data[0] === 5) incoming.enqueue(Uint8Array.of(5, 0, 0, 1, 127, 0, 0, 1, 0, 80));
          else if (new TextDecoder().decode(data).startsWith('CONNECT ')) incoming.enqueue(new TextEncoder().encode('HTTP/1.1 200 OK\r\n\r\n'));
          else {
            // The target may have consumed the request even when write rejects.
            delivered.push(data.slice());
            throw new Error('write failed after possible delivery');
          }
        } }),
        close() { try { incoming.close(); } catch {} closed(); }
      };
      sockets.push(socket); return socket;
    } });
    await worker.fetch(new Request(ORIGIN, { headers: { Upgrade: 'websocket' } }),
      environment({ s: proxy, ex: 'no', p: 'fallback.example:443' }), { waitUntil() {} });
    const ws = runtime.pairs[0][1];
    t.after(async () => { ws.close(); sockets.forEach(socket => socket.close()); await settle(); });
    ws.receive(firstPacket(post));
    await settle();
    assert.equal(delivered.length, 1);
    assert.deepEqual(Buffer.from(delivered[0]), Buffer.from(post));
    assert.equal(ws.readyState, 3);
    assert.equal(timers.pending.size, 0);
  });
}


test('input reserved immediately before the timer cannot escape replay validation', async t => {
  const { ws, timers, primary, fallback } = await session(t);
  ws.receive(firstPacket(hello));
  await settle();
  const original = primary();
  ws.receive(applicationRecord);
  // Run the timeout before pipeTo can consume the just-reserved WS message.
  await timers.tick(3_500);
  await settle();
  assert.equal(primary(), original);
  assert.equal(fallback(), undefined);
  assert.deepEqual(joined(original.writes), Buffer.concat([Buffer.from(hello), Buffer.from(applicationRecord)]));
});

test('a late completion of the old TLS write leaves the replacement upload intact', async t => {
  const { ws, timers, primary, fallback } = await session(t, { stallPrimaryWrite: true });
  ws.receive(firstPacket(hello.subarray(0, 5)));
  await settle();
  const original = primary();
  ws.receive(hello.subarray(5));
  await settle();
  await timers.tick(3_500);
  ws.receive(post);
  await settle();
  original.resolveWrite();
  await settle();
  assert.deepEqual(joined(fallback().writes), Buffer.concat([Buffer.from(hello), Buffer.from(post)]));
  assert.equal(ws.readyState, 1);
});


for (const fragmented of [false, true]) {
  test(`a ClientHello with one valid compatibility CCS remains replayable${fragmented ? ' across WS messages' : ''}`, async t => {
    const { ws, timers, fallback } = await session(t);
    const packet = Uint8Array.of(...hello, 20, 3, 3, 0, 1, 1);
    ws.receive(firstPacket(fragmented ? hello : packet));
    await settle();
    if (fragmented) for (const byte of packet.subarray(hello.length)) { ws.receive(Uint8Array.of(byte)); await settle(); }
    await timers.tick(3_500);
    assert.deepEqual(joined(fallback().writes), Buffer.from(packet));
    assert.equal(ws.readyState, 1);
  });
}


test('a failed complete ClientHello write can still use the safe fallback', async t => {
  const { ws, fallback } = await session(t, { rejectPrimaryPayload: true });
  ws.receive(firstPacket(hello));
  await settle();
  assert.deepEqual(joined(fallback().writes), Buffer.from(hello));
  assert.equal(ws.readyState, 1);
});
