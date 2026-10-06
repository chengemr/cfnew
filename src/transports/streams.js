const bufferSize = 128 * 1024;

// Upload EOF is a half-close. Keep reading until the remote side ends or fails.
export function createXHTTPRelay(packet, socket, idleTimeout = 45_000, signal) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  let lastActivity = Date.now();
  const touch = () => { lastActivity = Date.now(); };
  const output = new TransformStream({
    start(stream) { stream.enqueue(packet.resp); },
    transform(chunk, stream) { touch(); stream.enqueue(chunk); }
  }, null, new ByteLengthQueuingStrategy({ highWaterMark: bufferSize }));
  const writer = socket.writable.getWriter();
  const upload = (async () => {
    try {
      if (packet.data.length) { touch(); await writer.write(packet.data); }
      while (!packet.done) {
        const { done, value } = await packet.reader.read(new Uint8Array(bufferSize));
        if (done) break;
        if (value?.length) { touch(); await writer.write(value); }
      }
      await writer.close();
    } catch (error) {
      // Cancel before releasing the reader; a released reader cannot stop a
      // still-open request body when the remote write fails.
      await packet.reader.cancel(error).catch(() => {});
      throw error;
    } finally {
      packet.reader.releaseLock();
      writer.releaseLock();
    }
  })();
  const download = socket.readable.pipeTo(output.writable, { signal: controller.signal });
  const timer = setInterval(() => {
    if (Date.now() - lastActivity >= idleTimeout) controller.abort(new Error('idle timeout'));
  }, 5_000);
  const closed = Promise.race([download, upload.then(() => download)]).catch(() => {}).finally(async () => {
    clearInterval(timer);
    signal?.removeEventListener('abort', abort);
    controller.abort();
    await Promise.allSettled([
      packet.reader.cancel(), writer.abort(), Promise.resolve().then(() => socket.close())
    ]);
    await Promise.allSettled([upload, download]);
  });
  return { readable: output.readable, closed };
}
