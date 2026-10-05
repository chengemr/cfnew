import { ORIGIN, UUID } from './worker.mjs';

export function vlessHeader(uuid = UUID) {
  const id = Uint8Array.from(uuid.replaceAll('-', '').match(/../g), hex => parseInt(hex, 16));
  return Uint8Array.from([0, ...id, 0, 1, 1, 187, 1, 192, 0, 2, 10]);
}

export function xhttpRequest(packet = vlessHeader()) {
  const stream = new ReadableStream({ type: 'bytes', start(controller) {
    controller.enqueue(packet.slice());
    controller.close();
  } });
  return requestWithBody(stream);
}

export function requestWithBody(body) {
  const request = new Request(ORIGIN + '/', { method: 'POST', body, duplex: 'half' });
  const getReader = request.body.getReader.bind(request.body);
  request.body.getReader = options => {
    const reader = getReader(options);
    // Cloudflare's BYOB extension; underlying reads still use Node byte streams.
    reader.readAtLeast = async (minimum, view) => {
      const chunks = [];
      let size = 0;
      let done = false;
      while (size < minimum && !done) {
        const result = await reader.read(view);
        done = result.done;
        if (result.value) {
          chunks.push(result.value.slice());
          size += result.value.byteLength;
        }
        view = new Uint8Array(128 * 1024);
      }
      const value = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { value.set(chunk, offset); offset += chunk.length; }
      return { value, done };
    };
    return reader;
  };
  return request;
}

export function websocketRuntime() {
  const pairs = [];
  class Socket {
    static OPEN = 1;
    static CLOSING = 2;
    readyState = 0;
    listeners = new Map();
    accept() { this.readyState = 1; }
    addEventListener(type, listener) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(listener);
    }
    removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
    dispatch(type, event) { for (const listener of this.listeners.get(type) || []) listener(event); }
    send() {}
    receive(data) { this.dispatch('message', { data }); }
    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      this.dispatch('close', {});
    }
  }
  class Pair {
    constructor() {
      this[0] = new Socket();
      this[1] = new Socket();
      pairs.push(this);
    }
  }
  class WorkerResponse extends Response {
    constructor(body, init) {
      super(body, init?.status === 101 ? { ...init, status: 200 } : init);
      if (init?.status === 101) Object.defineProperty(this, 'status', { value: 101 });
      this.webSocket = init?.webSocket;
    }
  }
  return { pairs, globals: { WebSocket: Socket, WebSocketPair: Pair, Response: WorkerResponse } };
}

export const context = { waitUntil() { throw new Error('unexpected background task'); } };
export const flush = () => new Promise(resolve => setImmediate(resolve));
