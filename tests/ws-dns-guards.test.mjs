import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { ORIGIN, UUID, environment, loadWorker } from './helpers/worker.mjs';
import { context, flush, vlessHeader, websocketRuntime } from './helpers/transports.mjs';
import { timerRuntime } from './helpers/timers.mjs';

const limit = 256 * 1024;
const frame = id => Uint8Array.of(0, 2, id, 43);
const joined = chunks => Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
function packet(payload = new Uint8Array(), dns = false) {
  const header = vlessHeader();
  if (dns) { header[18] = 2; header[19] = 0; header[20] = 53; }
  return Uint8Array.from([...header, ...payload]);
}

async function session(t, { phase, early, env } = {}) {
  const runtime = websocketRuntime(), timers = timerRuntime(), sockets = [];
  const { worker } = await loadWorker(t, {
    globals: { ...runtime.globals, ...timers.globals },
    connect(target) {
      let incoming, finish, open, failWrite;
      const socket = {
        target, writes: [], closes: 0,
        opened: phase === 'opening' ? new Promise(resolve => { open = resolve; }) : Promise.resolve(),
        closed: new Promise(resolve => { finish = resolve; }),
        readable: new ReadableStream({ start(controller) { incoming = controller; } }),
        writable: new WritableStream({ write(data) {
          socket.writes.push(data.slice());
          if (phase === 'initial-write' || (phase === 'later-write' && socket.writes.length > 1)) {
            return new Promise((_, reject) => { failWrite = reject; });
          }
        } }),
        reply(data) { incoming.enqueue(data); },
        close() {
          socket.closes++;
          try { incoming.close(); } catch {}
          failWrite?.(new Error('fixture closed'));
          finish(); open?.();
        }
      };
      sockets.push(socket);
      return socket;
    }
  });
  const response = await worker.fetch(new Request(ORIGIN, { headers: {
    Upgrade: 'websocket', ...(early ? { 'sec-websocket-protocol': Buffer.from(early).toString('base64url') } : {})
  } }), environment({ ex: 'no', et: 'no', ...env }), context);
  assert.equal(response.status, 101);
  const ws = runtime.pairs[0][1], received = [];
  ws.send = data => received.push(data.slice());
  t.after(async () => {
    ws.close();
    for (const socket of sockets) if (!socket.closes) socket.close();
    await flush();
  });
  await flush();
  return { ws, sockets, timers, received, active: () => sockets.find(socket => !socket.closes) };
}

test('DNS sends a second query and response while the same upstream stays open', async t => {
  const { ws, sockets, timers, received, active } = await session(t);
  ws.receive(packet(frame(41), true));
  await flush();
  active().reply(frame(41));
  await timers.tick(10);
  ws.receive(frame(42));
  await flush();
  assert.deepEqual([...joined(active().writes)], [...frame(41), ...frame(42)]);
  active().reply(frame(42));
  await timers.tick(10);
  assert.deepEqual([...joined(received)], [0, 0, ...frame(41), ...frame(42)]);
  assert.equal(sockets.length, 1);
  assert.equal(ws.readyState, 1);
});

test('DNS preserves split length prefixes and several frames per WS/TCP message', async t => {
  const { ws, timers, received, active } = await session(t);
  ws.receive(packet(frame(41).subarray(0, 1), true));
  await flush();
  ws.receive(Uint8Array.from([...frame(41).subarray(1), ...frame(42), ...frame(43)]));
  await flush();
  assert.deepEqual([...joined(active().writes)], [...frame(41), ...frame(42), ...frame(43)]);
  const replies = Uint8Array.from([...frame(41), ...frame(42), ...frame(43)]);
  for (const piece of [replies.subarray(0, 1), replies.subarray(1, 3), replies.subarray(3, 9), replies.subarray(9)]) {
    active().reply(piece);
    await timers.tick(10);
  }
  assert.deepEqual([...joined(received)], [0, 0, ...replies], 'VLESS response header appears once');
  await timers.tick(5_000);
  assert.equal(ws.readyState, 1, 'answered DNS queries must not hit the response deadline');
});

for (const response of ['none', 'partial', 'second-missing']) {
  test(`DNS ${response} response times out and releases the upstream`, async t => {
    const { ws, sockets, timers, active } = await session(t);
    ws.receive(packet(frame(41), true));
    await flush();
    if (response === 'partial') active().reply(frame(41).subarray(0, 3));
    if (response === 'second-missing') {
      active().reply(frame(41));
      await timers.tick(10);
      ws.receive(frame(42));
      await flush();
    }
    await timers.tick(60_000);
    assert.equal(ws.readyState, 3);
    assert.ok(sockets.every(socket => socket.closes === 1));
    assert.ok(sockets.every(socket => !socket.readable.locked && !socket.writable.locked));
    assert.equal(timers.pending.size, 0);
  });
}

test('DNS disconnect cleans a pending download and the response timer', async t => {
  const { ws, sockets, timers } = await session(t);
  ws.receive(packet(frame(41), true));
  await flush();
  ws.close();
  await flush();
  assert.equal(sockets.length, 1);
  assert.equal(sockets[0].closes, 1);
  assert.equal(sockets[0].readable.locked, false);
  assert.equal(sockets[0].writable.locked, false);
  assert.equal(timers.pending.size, 0);
});

test('DNS timeout cleans upstream without waiting for the WS close handshake', async t => {
  const { ws, sockets, timers } = await session(t);
  ws.receive(packet(frame(41), true));
  await flush();
  // Cloudflare can stay CLOSING until the peer acknowledges the close frame.
  ws.close = () => { ws.readyState = 2; };
  await timers.tick(5_000);
  assert.equal(ws.readyState, 2);
  assert.equal(sockets[0].closes, 1);
  assert.equal(sockets[0].readable.locked, false);
  assert.equal(sockets[0].writable.locked, false);
  assert.equal(timers.pending.size, 0);
});

test('DNS extra queries and partial replies do not postpone the response deadline', async t => {
  const { ws, sockets, timers, active } = await session(t);
  ws.receive(packet(frame(41), true));
  await flush();
  await timers.tick(4_000);
  active().reply(frame(41).subarray(0, 1));
  ws.receive(frame(42));
  await flush();
  await timers.tick(1_000);
  assert.equal(ws.readyState, 3);
  assert.equal(sockets[0].closes, 1);
  assert.equal(timers.pending.size, 0);
});

test('DNS answered sessions clean up after forty-five seconds idle', async t => {
  const { ws, sockets, timers, active } = await session(t);
  ws.receive(packet(frame(41), true));
  await flush();
  active().reply(frame(41));
  await flush();
  await timers.tick(44_999);
  assert.equal(ws.readyState, 1);
  await timers.tick(1);
  assert.equal(ws.readyState, 3);
  assert.equal(sockets[0].closes, 1);
  assert.equal(sockets[0].readable.locked, false);
  assert.equal(sockets[0].writable.locked, false);
  assert.equal(timers.pending.size, 0);
});

for (const phase of ['opening', 'handshake', 'initial-write', 'later-write']) {
  test(`WS counts queued and in-flight bytes during ${phase}`, async t => {
    const { ws, sockets, timers } = await session(t, {
      phase, env: phase === 'handshake' ? { s: 'proxy.example:1080', qj: 'only' } : {}
    });
    ws.receive(packet(Uint8Array.of(42)));
    await flush();
    // A stalled active write is outside createUploadQueue's own byte count.
    ws.receive(new Uint8Array(limit));
    await flush();
    if (phase === 'later-write') ws.receive(Uint8Array.of(43));
    await flush();
    assert.equal(ws.readyState, 3, 'overflow must close before the dial/write timeout');
    assert.ok(sockets.length > 0);
    assert.ok(sockets.every(socket => socket.closes === 1));
    assert.ok(sockets.every(socket => !socket.readable.locked && !socket.writable.locked));
    assert.equal(timers.pending.size, 0);
  });
}

test('WS early data shares the 256 KiB entry limit', async t => {
  const { ws, sockets, timers } = await session(t, { early: packet(new Uint8Array(limit)) });
  assert.equal(ws.readyState, 3);
  assert.equal(sockets.length, 0);
  assert.equal(timers.pending.size, 0);
});

test('WS early data and queued messages share one limit while connecting', async t => {
  const { ws, sockets, timers } = await session(t, { early: packet(new Uint8Array(128 * 1024)), phase: 'opening' });
  ws.receive(new Uint8Array(128 * 1024 + 1));
  await flush();
  assert.equal(ws.readyState, 3);
  assert.ok(sockets.every(socket => socket.closes === 1));
  assert.equal(timers.pending.size, 0);
});

test('WS without an authentication packet closes after about five seconds', async t => {
  const { ws, sockets, timers } = await session(t);
  await timers.tick(4_999);
  assert.equal(ws.readyState, 1);
  await timers.tick(1);
  assert.equal(ws.readyState, 3);
  assert.equal(sockets.length, 0);
  assert.equal(timers.pending.size, 0);
});

test('WS disconnect before authentication clears the deadline', async t => {
  const { ws, timers } = await session(t);
  ws.close();
  await flush();
  assert.equal(timers.pending.size, 0);
});

test('WS valid early authentication clears the deadline and releases written byte reservations', async t => {
  const { ws, timers, active } = await session(t, { early: packet(Uint8Array.of(42)) });
  active().reply(Uint8Array.of(99));
  await timers.tick(10);
  for (let i = 0; i < 3; i++) {
    ws.receive(new Uint8Array(limit));
    await flush();
    assert.equal(ws.readyState, 1, 'completed writes must leave room for later messages');
  }
  await timers.tick(6_000);
  assert.equal(ws.readyState, 1);
  assert.equal(timers.pending.size, 0);
});

test('WS valid Trojan authentication clears the deadline and preserves its payload', async t => {
  const { ws, timers, active, received } = await session(t, { env: { ev: 'no', et: 'yes' } });
  const hash = new TextEncoder().encode(createHash('sha224').update(UUID).digest('hex'));
  ws.receive(Uint8Array.of(...hash, 13, 10, 1, 1, 192, 0, 2, 10, 1, 187, 13, 10, 42));
  for (let i = 0; i < 5; i++) await flush();
  assert.deepEqual([...joined(active().writes)], [42]);
  active().reply(Uint8Array.of(99));
  await flush();
  await timers.tick(6_000);
  assert.deepEqual([...joined(received)], [99]);
  assert.equal(ws.readyState, 1);
  assert.equal(timers.pending.size, 0);
});
