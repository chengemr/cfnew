// The deadline includes headers and body, even when a fetch ignores abort.
export async function fetchBytes(url, options = {}, { timeout = 3_000, maxBytes = 1024 * 1024 } = {}) {
  const controller = new AbortController();
  let reader, timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new DOMException('Upstream request timeout', 'TimeoutError');
      controller.abort(error);
      reader?.cancel(error).catch(() => {});
      reject(error);
    }, timeout);
  });
  try {
    return await Promise.race([(async () => {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (controller.signal.aborted || !response.ok) {
        response.body?.cancel().catch(() => {});
        if (controller.signal.aborted) throw controller.signal.reason;
        return { response, bytes: null };
      }
      if (Number(response.headers.get('Content-Length')) > maxBytes) {
        response.body?.cancel().catch(() => {});
        throw new Error('Upstream response too large');
      }
      const chunks = [];
      let size = 0;
      reader = response.body?.getReader();
      while (reader) {
        const { value, done } = await reader.read();
        if (controller.signal.aborted) throw controller.signal.reason;
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) throw new Error('Upstream response too large');
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return { response, bytes };
    })(), deadline]);
  } finally {
    clearTimeout(timer);
    controller.abort();
    reader?.cancel().catch(() => {});
    try { reader?.releaseLock(); } catch {}
  }
}
