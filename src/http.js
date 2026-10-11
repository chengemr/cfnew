export class BodyReadError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export async function readRequestText(request, { timeout = 5_000, maxBytes = 4096 } = {}) {
  if (Number(request.headers.get('Content-Length')) > maxBytes) {
    request.body?.cancel().catch(() => {});
    throw new BodyReadError('请求正文过大', 413);
  }
  const reader = request.body?.getReader();
  if (!reader) return '';
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new BodyReadError('请求正文读取超时', 408);
      reader.cancel(error).catch(() => {});
      reject(error);
    }, timeout);
  });
  try {
    return await Promise.race([(async () => {
      const chunks = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) throw new BodyReadError('请求正文过大', 413);
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    })(), deadline]);
  } finally {
    clearTimeout(timer);
    reader.cancel().catch(() => {});
    try { reader.releaseLock(); } catch {}
  }
}

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
