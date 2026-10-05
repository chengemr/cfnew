// One deadline covers TCP opening, the proxy handshake and the first write.
// Keep the disconnect listener until the established sockets have closed.
export async function withConnectionDeadline(operation, signal, timeout = 5_000) {
  const sockets = new Set();
  let reject, finished = false, stopped = false;
  const close = socket => {
    if (!sockets.delete(socket)) return;
    try { socket.close(); } catch {}
    if (finished && !sockets.size) signal?.removeEventListener('abort', abort);
  };
  const cancel = reason => {
    stopped = true;
    for (const socket of sockets) close(socket);
    if (!finished) reject(reason);
  };
  const abort = () => cancel(signal.reason || new DOMException('Disconnected', 'AbortError'));
  const cancelled = new Promise((_, fail) => { reject = fail; });
  if (signal?.aborted) throw signal.reason;
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => cancel(new DOMException('Connection timeout', 'TimeoutError')), timeout);
  const open = create => {
    if (finished || stopped || signal?.aborted) throw new DOMException('Disconnected', 'AbortError');
    const socket = create();
    sockets.add(socket);
    socket.closed?.catch(() => {}).finally(() => {
      sockets.delete(socket);
      if (finished && !sockets.size) signal?.removeEventListener('abort', abort);
    });
    return socket;
  };
  try {
    const socket = await Promise.race([operation(open, close), cancelled]);
    if (signal?.aborted) throw signal.reason;
    return {
      readable: socket.readable, writable: socket.writable,
      opened: socket.opened, closed: socket.closed,
      close() { for (const active of sockets) close(active); }
    };
  } catch (error) {
    stopped = true;
    for (const socket of sockets) close(socket);
    signal?.removeEventListener('abort', abort);
    throw error;
  } finally {
    finished = true;
    clearTimeout(timer);
    if (!sockets.size) signal?.removeEventListener('abort', abort);
  }
}
