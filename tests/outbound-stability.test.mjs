import assert from 'node:assert/strict';
import test from 'node:test';
import { ORIGIN, environment, loadWorker } from './helpers/worker.mjs';
import { context, flush, requestWithBody, vlessHeader, websocketRuntime, xhttpRequest } from './helpers/transports.mjs';
import { timerRuntime } from './helpers/timers.mjs';

const dnsPacket = Uint8Array.of(...vlessHeader(), 0, 2, 42, 43);
dnsPacket[18] = 2;
dnsPacket[19] = 0;
dnsPacket[20] = 53;

function sockets({ pendingOpen = false, handshake = false, failDirect = false, stallWrite = false } = {}) {
  const attempts = [], opened = [], writes = [];
  return { attempts, opened, writes, connect(target) {
    attempts.push(target);
    if (failDirect && target.hostname !== 'proxy.example') throw new Error('direct unavailable');
    let incoming, end, open, failWrite;
    const socket = {
      closes: 0,
      opened: pendingOpen ? new Promise(resolve => { open = resolve; }) : Promise.resolve(),
      closed: new Promise(resolve => { end = resolve; }),
      readable: new ReadableStream({ start(controller) { incoming = controller; } }),
      writable: new WritableStream({ write(data) {
        writes.push(data.slice());
        if (stallWrite) return new Promise((_, reject) => { failWrite = reject; });
        if (handshake && target.hostname === 'proxy.example') {
          if (data[0] === 5 && data[1] === 1 && data.length === 3) incoming.enqueue(Uint8Array.of(5, 0));
          else if (data[0] === 5) incoming.enqueue(Uint8Array.of(5, 0, 0, 1, 127, 0, 0, 1, 0, 80));
        } else if (handshake) incoming.enqueue(Uint8Array.of(0, 2, 44, 45));
      } }),
      close() { this.closes++; try { incoming.close(); } catch {} failWrite?.(new Error('socket closed')); end(); open?.(); }
    };
    opened.push(socket);
    return socket;
  } };
}

async function websocket(t, env, remote, timers = timerRuntime()) {
  const runtime = websocketRuntime();
  const { worker } = await loadWorker(t, { connect: remote.connect,
    globals: { ...runtime.globals, ...timers.globals } });
  await worker.fetch(new Request(ORIGIN, { headers: { Upgrade: 'websocket' } }), environment(env), context);
  const client = runtime.pairs[0][1];
  t.after(async () => { client.close(); remote.opened.forEach(socket => socket.close()); await flush(); });
  return { client, timers };
}

for (const s of ['', 'invalid-proxy']) {
  test(`DNS only mode with ${s || 'no proxy'} refuses direct egress`, async t => {
    const remote = sockets();
    const { client } = await websocket(t, { qj: 'only', s }, remote);
    client.receive(dnsPacket);
    await flush();
    assert.deepEqual(remote.attempts, []);
    assert.equal(client.readyState, 3);
  });
}

for (const qj of ['', 'only', 'no']) {
  test(`DNS ${qj || 'default'} policy uses the configured proxy`, async t => {
    const remote = sockets({ handshake: true, failDirect: qj === 'no' });
    const { client } = await websocket(t, { qj, s: 'proxy.example:1080' }, remote);
    client.receive(dnsPacket);
    for (let i = 0; i < 5; i++) await flush();
    assert.equal(remote.attempts.at(-1).hostname, 'proxy.example');
    const request = remote.writes.find(data => data[0] === 5 && data[3] === 3);
    assert.equal(new TextDecoder().decode(request.slice(5, -2)), '8.8.4.4');
    assert.deepEqual([...request.slice(-2)], [0, 53]);
    assert.ok(remote.writes.some(data => data.length === 4 && data[2] === 42 && data[3] === 43));
    if (qj !== 'no') assert.equal(remote.attempts.length, 1);
  });
}

test('DNS direct mode preserves the framed answer and closes its upstream after completion', async t => {
  const remote = sockets({ handshake: true });
  const { client } = await websocket(t, {}, remote);
  const received = [];
  client.send = data => received.push(...data);
  client.receive(dnsPacket);
  for (let i = 0; i < 5; i++) await flush();
  remote.opened[0].close();
  await flush();
  assert.deepEqual(received, [0, 0, 0, 2, 44, 45]);
});

for (const s of ['', 'proxy.example:1080', 'http://proxy.example:8080', 'https://proxy.example:443']) {
  for (const pendingOpen of [true, false]) {
    if (!s && !pendingOpen) continue;
    const name = s || 'direct race';
    test(`WebSocket ${name} ${pendingOpen ? 'opening' : 'handshake'} expires and cleans sockets`, async t => {
      const remote = sockets({ pendingOpen });
      const { client, timers } = await websocket(t, { qj: s ? 'only' : '', s }, remote);
      client.receive(vlessHeader());
      await flush();
      await timers.tick(60_000);
      assert.equal(client.readyState, 3);
      assert.equal(remote.opened.length, s ? 1 : 4);
      assert.ok(remote.opened.every(socket => socket.closes === 1));
      assert.equal(timers.pending.size, 0);
    });

    test(`WebSocket disconnect cancels ${name} ${pendingOpen ? 'opening' : 'handshake'}`, async t => {
      const remote = sockets({ pendingOpen });
      const { client, timers } = await websocket(t, { qj: s ? 'only' : '', s }, remote);
      client.receive(vlessHeader());
      await flush();
      assert.equal(remote.opened.length, s ? 1 : 2);
      client.close();
      for (let i = 0; i < 5; i++) await flush();
      assert.ok(remote.opened.every(socket => socket.closes === 1));
      assert.equal(remote.attempts.length, s ? 1 : 2, 'disconnect must prevent fallback');
      assert.equal(timers.pending.size, 0);
    });
  }
}

test('XHTTP abort while opening cancels both competing sockets and releases the inbound reader', async t => {
  const remote = sockets({ pendingOpen: true });
  const timers = timerRuntime();
  const controller = new AbortController();
  const { worker } = await loadWorker(t, { connect: remote.connect, globals: timers.globals });
  const input = xhttpRequest();
  Object.defineProperty(input, 'signal', { value: controller.signal });
  const pending = worker.fetch(input, environment(), context);
  t.after(() => remote.opened.forEach(socket => socket.close()));
  await flush();
  controller.abort();
  for (let i = 0; i < 5; i++) await flush();
  assert.ok(remote.opened.every(socket => socket.closes === 1));
  assert.equal(remote.attempts.length, 2);
  assert.equal((await pending).status, 500);
  assert.equal(input.body.locked, false);
  assert.equal(timers.pending.size, 0);
});

for (const s of ['', 'proxy.example:1080', 'http://proxy.example:8080']) {
  test(`a stalled first write to ${s || 'direct target'} has a deadline`, async t => {
    const remote = sockets({ stallWrite: true });
    const { client, timers } = await websocket(t, { qj: s ? 'only' : '', s }, remote);
    client.receive(Uint8Array.of(...vlessHeader(), 42));
    await flush();
    await timers.tick(60_000);
    assert.equal(client.readyState, 3);
    assert.ok(remote.opened.every(socket => socket.closes === 1));
    assert.equal(timers.pending.size, 0);
  });
}

for (const s of ['proxy.example:1080', 'http://proxy.example:8080', 'https://proxy.example:443']) {
  test(`XHTTP stalled ${s} handshake times out and releases the body`, async t => {
    const remote = sockets();
    const timers = timerRuntime();
    const { worker } = await loadWorker(t, { connect: remote.connect, globals: timers.globals });
    const input = xhttpRequest();
    let response;
    const pending = worker.fetch(input, environment({ qj: 'only', s }), context).then(value => { response = value; });
    t.after(() => remote.opened.forEach(socket => socket.close()));
    await flush();
    await timers.tick(60_000);
    assert.equal(response?.status, 500);
    await pending;
    assert.equal(remote.opened[0].closes, 1);
    assert.equal(input.body.locked, false);
    assert.equal(timers.pending.size, 0);
  });
}

test('a race winner closes a competitor that has not finished opening', async t => {
  const remote = sockets();
  const connect = remote.connect;
  remote.connect = target => {
    const socket = connect(target);
    if (remote.opened.length === 2) socket.opened = new Promise(() => {});
    return socket;
  };
  const { client } = await websocket(t, {}, remote);
  client.receive(vlessHeader());
  await flush();
  assert.equal(remote.opened[0].closes, 0);
  assert.equal(remote.opened[1].closes, 1);
});

test('disconnect closes an active DNS upstream once and releases its reader', async t => {
  const remote = sockets();
  const { client, timers } = await websocket(t, {}, remote);
  client.receive(dnsPacket);
  await flush();
  client.close();
  for (let i = 0; i < 5; i++) await flush();
  assert.equal(remote.opened[0].closes, 1);
  assert.equal(remote.opened[0].readable.locked, false);
  assert.equal(timers.pending.size, 0);
});

test('XHTTP abort during header reading releases the body without opening a socket', async t => {
  const timers = timerRuntime();
  let cancelled = false;
  const body = new ReadableStream({ type: 'bytes', cancel() { cancelled = true; } });
  const input = requestWithBody(body);
  const controller = new AbortController();
  Object.defineProperty(input, 'signal', { value: controller.signal });
  const { worker } = await loadWorker(t, { globals: timers.globals });
  const pending = worker.fetch(input, environment(), context);
  await flush();
  controller.abort();
  await flush();
  assert.equal(cancelled, true);
  assert.equal((await pending).status, 500);
  assert.equal(body.locked, false);
  assert.equal(timers.pending.size, 0);
});
