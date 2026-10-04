import assert from 'node:assert/strict';
import test from 'node:test';
import { environment, loadWorker } from './helpers/worker.mjs';
import { deferred } from './helpers/deferred.mjs';
import { flush, requestWithBody, vlessHeader } from './helpers/transports.mjs';
import { timerRuntime } from './helpers/timers.mjs';

function openBody(packet = vlessHeader()) {
  let controller;
  const body = new ReadableStream({ type: 'bytes', start(value) {
    controller = value;
    controller.enqueue(packet.slice());
  } });
  return { request: requestWithBody(body), controller, close() {
    try { controller.close(); controller.byobRequest?.respond(0); } catch {}
  } };
}

function sockets() {
  const list = [];
  return { list, connect() {
    let controller;
    const socket = {
      opened: Promise.resolve(), closes: 0, writes: [],
      readable: new ReadableStream({ start(value) { controller = value; } }),
      writable: new WritableStream({ write(value) { socket.writes.push(value.slice()); } }),
      send(value) { controller.enqueue(value); },
      end() { try { controller.close(); } catch {} },
      close() { this.closes++; this.end(); }
    };
    list.push(socket);
    return socket;
  } };
}

async function connection(t) {
  const timers = timerRuntime();
  const remote = sockets();
  const body = openBody();
  const tasks = [];
  const { worker } = await loadWorker(t, { globals: timers.globals, connect: remote.connect });
  const response = await worker.fetch(body.request, environment(), { waitUntil(task) { tasks.push(task); } });
  assert.equal(response.status, 200);
  const reader = response.body.getReader();
  assert.deepEqual([...((await reader.read()).value)], [0, 0]);
  const socket = remote.list.find(item => item.closes === 0);
  t.after(async () => {
    body.close();
    for (const item of remote.list) item.end();
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    await Promise.allSettled(tasks);
  });
  return { timers, remote, body, tasks, reader, socket, worker };
}

for (const direction of ['download', 'upload']) {
  test(`active XHTTP ${direction} survives more than 45 seconds`, async t => {
    const { timers, body, socket, reader } = await connection(t);
    for (let i = 0; i < 6; i++) {
      await timers.tick(10_000);
      assert.equal(socket.closes, 0, `active connection closed after ${(i + 1) * 10} seconds`);
      const data = Uint8Array.of(i + 1);
      if (direction === 'download') {
        socket.send(data);
        assert.deepEqual([...((await reader.read()).value)], [...data]);
      } else {
        body.controller.enqueue(data);
        await flush();
        assert.deepEqual([...socket.writes.at(-1)], [i + 1]);
      }
    }
  });
}

test('idle XHTTP connections close and release their streams and timers', async t => {
  const { timers, body, socket, tasks, reader } = await connection(t);
  await timers.tick(50_000);
  await Promise.allSettled(tasks);
  await reader.cancel().catch(() => {});
  await flush();
  assert.equal(socket.closes, 1);
  assert.equal(body.request.body.locked, false);
  assert.equal(socket.readable.locked, false);
  assert.equal(socket.writable.locked, false);
  assert.equal(timers.pending.size, 0);
});

test('remote EOF releases the request reader and every timer', async t => {
  const { timers, body, socket, tasks, reader } = await connection(t);
  socket.end();
  await Promise.allSettled(tasks);
  assert.equal((await reader.read()).done, true);
  await flush();
  assert.equal(body.request.body.locked, false);
  assert.equal(socket.readable.locked, false);
  assert.equal(socket.writable.locked, false);
  assert.equal(timers.pending.size, 0);
});

test('upload EOF still permits a delayed response from the remote server', async t => {
  const { body, socket, reader } = await connection(t);
  body.close();
  await flush();
  assert.equal(socket.closes, 0);
  socket.send(Uint8Array.of(42));
  assert.deepEqual([...((await reader.read()).value)], [42]);
});

test('an incomplete XHTTP header times out and releases the reserved connection', async t => {
  const timers = timerRuntime();
  const { worker } = await loadWorker(t, { globals: timers.globals });
  const body = openBody(vlessHeader().slice(0, 18));
  const completed = deferred();
  const pending = worker.fetch(body.request, environment(), { waitUntil() { assert.fail(); } });
  pending.then(completed.resolve);
  t.after(async () => { body.close(); await pending; });
  await flush();
  await timers.tick(5_000);
  let settled = false;
  completed.promise.then(() => { settled = true; });
  await flush();
  assert.equal(settled, true, 'incomplete headers held a connection indefinitely');
  assert.equal((await pending).status, 408);
  assert.equal(body.request.body.locked, false);
  assert.equal(timers.pending.size, 0);
});
