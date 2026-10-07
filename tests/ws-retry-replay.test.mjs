import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { ORIGIN, UUID, environment, loadWorker } from './helpers/worker.mjs';
import { flush, vlessHeader, websocketRuntime } from './helpers/transports.mjs';
import { timerRuntime } from './helpers/timers.mjs';

const limit = 256 * 1024;
const joined = chunks => Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
const settle = async () => { for (let i = 0; i < 5; i++) await flush(); };
const firstPacket = (payload, trojan = false) => trojan
  ? Uint8Array.of(...new TextEncoder().encode(createHash('sha224').update(UUID).digest('hex')),
    13, 10, 1, 1, 192, 0, 2, 10, 1, 187, 13, 10, ...payload)
  : Uint8Array.of(...vlessHeader(), ...payload);

async function session(t, { pendingFallback = false, stallPrimaryWrite = false, trojan = false } = {}) {
  const runtime = websocketRuntime(), timers = timerRuntime(), sockets = [];
  let openFallback;
  const opening = new Promise(resolve => { openFallback = resolve; });
  const { worker } = await loadWorker(t, {
    globals: { ...runtime.globals, ...timers.globals },
    connect(target) {
      let incoming, closed, rejectWrite;
      const fallback = target.hostname === 'fallback.example';
      const socket = {
        target, closes: 0, writes: [], started: [],
        opened: fallback && pendingFallback ? opening : Promise.resolve(),
        closed: new Promise(resolve => { closed = resolve; }),
        readable: new ReadableStream({ start(controller) { incoming = controller; } }),
        writable: new WritableStream({ async write(data) {
          socket.started.push(data.slice());
          if (!fallback && stallPrimaryWrite && socket.started.length > 1) {
            await new Promise((_, reject) => { rejectWrite = reject; });
          }
          socket.writes.push(data.slice());
        } }),
        reply(data) { incoming.enqueue(data.slice()); },
        rejectWrite() { rejectWrite?.(new Error('old socket write failed')); },
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
  return { ws, timers, sockets, primary, fallback, openFallback };
}

for (const trojan of [false, true]) {
  test(`${trojan ? 'Trojan' : 'VLESS'} first-byte retry replays uploads from every WS message`, async t => {
    const { ws, timers, primary, fallback } = await session(t, { trojan });
    ws.receive(firstPacket(Uint8Array.of(1, 2), trojan));
    await settle();
    const original = primary();
    ws.receive(Uint8Array.of(3, 4));
    await settle();
    assert.deepEqual([...joined(original.writes)], [1, 2, 3, 4]);
    await timers.tick(3_500);
    await settle();
    assert.deepEqual([...joined(fallback().writes)], [1, 2, 3, 4]);
    assert.equal(ws.readyState, 1);
  });
}

test('a header-only first WS message replays all later payload', async t => {
  const { ws, timers, fallback } = await session(t);
  ws.receive(vlessHeader());
  await settle();
  ws.receive(Uint8Array.of(1, 2));
  ws.receive(Uint8Array.of(3, 4));
  await settle();
  await timers.tick(3_500);
  await settle();
  assert.deepEqual([...joined(fallback().writes)], [1, 2, 3, 4]);
});

test('messages arriving during the retry dial follow the replay exactly once', async t => {
  const { ws, timers, fallback, openFallback } = await session(t, { pendingFallback: true });
  ws.receive(firstPacket(Uint8Array.of(1, 2)));
  await settle();
  ws.receive(Uint8Array.of(3, 4));
  await settle();
  await timers.tick(3_500);
  ws.receive(Uint8Array.of(5, 6));
  await settle();
  assert.deepEqual(fallback().writes, []);
  openFallback();
  await settle();
  assert.deepEqual([...joined(fallback().writes)], [1, 2, 3, 4, 5, 6]);
  ws.receive(Uint8Array.of(7, 8));
  await settle();
  assert.deepEqual([...joined(fallback().writes)], [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(ws.readyState, 1);
});

test('a stalled old write and queued bytes survive retry and its late rejection', async t => {
  const { ws, timers, primary, fallback } = await session(t, { stallPrimaryWrite: true });
  ws.receive(firstPacket(Uint8Array.of(1, 2)));
  await settle();
  const original = primary();
  ws.receive(Uint8Array.of(3, 4));
  await settle();
  ws.receive(Uint8Array.of(5, 6));
  await settle();
  assert.deepEqual([...joined(original.started)], [1, 2, 3, 4]);
  await timers.tick(3_500);
  await settle();
  assert.deepEqual([...joined(fallback().writes)], [1, 2, 3, 4, 5, 6]);
  ws.receive(Uint8Array.of(7, 8));
  await settle();
  original.rejectWrite();
  await settle();
  assert.deepEqual([...joined(fallback().writes)], [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(ws.readyState, 1);
});

test('completed upload history remains within the shared 256 KiB budget', async t => {
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
  assert.equal(ws.readyState, 3);
  assert.ok(sockets.every(socket => socket.closes === 1));
  assert.equal(timers.pending.size, 0);
});

test('the first remote byte releases replay reservations without releasing an in-flight write', async t => {
  const { ws, primary, timers } = await session(t, { stallPrimaryWrite: true });
  ws.receive(firstPacket(new Uint8Array(16 * 1024)));
  await settle();
  const socket = primary();
  ws.receive(new Uint8Array(240 * 1024));
  await settle();
  socket.reply(Uint8Array.of(42));
  await settle();
  // Only the completed initial write has been released; the 240 KiB write
  // still owns its reservation while the server has already replied.
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
