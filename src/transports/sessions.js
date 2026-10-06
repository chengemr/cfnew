import { asBytes, concatBytes } from '../encoding.js';
import { parseProxy as 解析代理配置 } from './proxy.js';
import { dialOutbound, outboundAttempts, 获取回退目标 } from './outbound.js';
import { parseVlessHeader, parseTrojanHeader, readXHTTPHeader } from './protocols.js';
import { createXHTTPRelay } from './streams.js';

const 错误_仅支持域名系统用户数据报 = "UDP proxy only enable for DNS which is port 53";
const 错误_网页套接字未打开 = "webSocket.eadyState is not open";
const 传输块大小 = 64 * 1024;
const 传输下载包大小 = 32 * 1024;
const 传输下载尾部 = 512;
const 传输下载延迟 = 0;
const 传输上传包大小 = 16 * 1024;
const 传输上传队列上限 = 256 * 1024;
const 首字节超时 = 3500;
const 认证超时 = 5_000;
const DNS响应超时 = 5_000;
const DNS空闲超时 = 45_000;
let activeXHTTPConnections = 0;
const 上限值 = 32;
export async function handleWebSocket(request, 配置快照) {
  const { 认证令牌, 启用明文, 启用木马, 传输路径 } = 配置快照;
  // 从 path query 读取覆盖参数
  const 请求网址 = new URL(request.url);
  const queryFallback = 请求网址.searchParams.get('p') || '';
  const queryRegion = (请求网址.searchParams.get('wk') || '').toUpperCase();
  const 请求值字符串 = 请求网址.searchParams.get('rm') || '';
  const queryRegionMatch = 请求值字符串 ? 请求值字符串.toLowerCase() !== 'no' : null;
  const 请求代理字符串 = 请求网址.searchParams.get('s') || '';
  let queryProxy = null;
  if (请求代理字符串) {
    try {
      queryProxy = 解析代理配置(请求代理字符串);
    } catch {}
  }

  const 网页套接字值 = new WebSocketPair();
  const [客户端值, websocket] = Object.values(网页套接字值);
  websocket.accept();
  websocket.binaryType = 'arraybuffer';
  let remote = {
    socket: null,
    writer: null,
    drainUpload: null,
    close: 关闭传输
  };
  let 是否域名系统值 = false;
  let 协议类型 = null;
  let drainingUpload = false;
  let 传输值 = false;
  let pendingBytes = 0;
  const 值队列 = createUploadQueue(传输上传包大小, 传输上传队列上限, 传输上传队列上限 >> 8);
  const fetcher = request.fetcher;
  const 连接取消 = new AbortController();
  const authenticationTimer = setTimeout(关闭传输, 认证超时);
  const 出站配置 = { ...配置快照,
    已解析代理5配置: queryProxy || 配置快照.已解析代理5配置,
    是否代理已启用: !!queryProxy || 配置快照.是否代理已启用,
    回退地址: queryFallback || 配置快照.回退地址,
    当前工作器地区: queryRegion || 配置快照.当前工作器地区,
    启用地区匹配: queryRegionMatch ?? 配置快照.启用地区匹配 };
  function 处理值远程写入器() {
    try {
      remote.writer?.releaseLock();
    } catch {}
    remote.writer = null;
  }
  function 关闭传输() {
    if (传输值) return;
    传输值 = true;
    clearTimeout(authenticationTimer);
    pendingBytes = 0;
    连接取消.abort();
    值队列.clear();
    处理值远程写入器();
    closeWebSocket(websocket);
  }
  // A stream abort waits for an in-flight write; cancel pending dials directly.
  websocket.addEventListener('close', 关闭传输);
  websocket.addEventListener('error', 关闭传输);
  function reserveInput(data) {
    if (传输值) return false;
    if (pendingBytes + data.byteLength > 传输上传队列上限) {
      关闭传输();
      return false;
    }
    pendingBytes += data.byteLength;
    return true;
  }
  function releaseInput(bytes) {
    pendingBytes = Math.max(0, pendingBytes - bytes);
  }
  function authenticated(protocol, headerBytes) {
    协议类型 = protocol;
    clearTimeout(authenticationTimer);
    releaseInput(headerBytes);
  }
  function 处理队列值(chunk) {
    const data = asBytes(chunk);
    if (!data.byteLength) return true;
    if (!值队列.sow(data)) {
      关闭传输();
      return false;
    }
    remote.drainUpload();
    return true;
  }
  async function drainUpload() {
    if (drainingUpload || 传输值 || !remote.writer) return;
    drainingUpload = true;
    try {
      for (;;) {
        if (传输值 || !remote.writer) break;
        const data = 值队列.bundle();
        if (!data) break;
        remote.onUpload?.(data);
        await remote.writer.write(data);
        releaseInput(data.byteLength);
      }
    } catch {
      关闭传输();
    } finally {
      drainingUpload = false;
      if (!值队列.empty && !传输值 && remote.writer) queueMicrotask(drainUpload);
    }
  }
  remote.drainUpload = () => {
    if (!drainingUpload && !值队列.empty && remote.writer) queueMicrotask(drainUpload);
  };
  const earlyDataHeader = request.headers.get("sec-websocket-protocol") || '';
  // Reserve at the event boundary, before pipeTo can queue behind a pending
  // dial/write. Keep reservations until the corresponding socket write ends.
  const inbound = webSocketReadable(websocket, earlyDataHeader, reserveInput, 连接取消.signal);
  inbound.pipeTo(new WritableStream({
    close() { 关闭传输(); },
    abort() { 关闭传输(); },
    async write(chunk) {
      if (传输值) return;
      const data = asBytes(chunk);
      if (remote.socket && remote.writer) {
        if (!处理队列值(data)) throw new Error('upload queue overflow');
        return;
      }
      if (协议类型) {
        if (!处理队列值(data)) throw new Error('upload queue overflow');
        return;
      }
      if (启用明文 && data.byteLength >= 24) {
        const 轻量协议结果 = parseVlessHeader(data, 认证令牌);
        if (!轻量协议结果.hasError) {
          const {
            port: port,
            hostname: hostname,
            rawIndex: 原始索引,
            version: version,
            isUDP: isUDP
          } = 轻量协议结果;
          if (isUDP) {
            if (port === 53) 是否域名系统值 = true;else throw new Error(错误_仅支持域名系统用户数据报);
          }
          const responseHeader = new Uint8Array([version[0], 0]);
          const payload = data.subarray(原始索引);
          authenticated('vless', 原始索引);
          try {
            if (是否域名系统值) {
              await forwardDNS(payload, websocket, responseHeader, remote, fetcher, 出站配置, 连接取消.signal);
            } else {
              await connectWebSocketTCP(hostname, port, payload, websocket, responseHeader, remote, fetcher, 出站配置, 连接取消.signal);
            }
          } finally { releaseInput(payload.byteLength); }
          return;
        }
      }
      if (启用木马 && data.byteLength >= 56) {
        const 值结果 = await parseTrojanHeader(data, 认证令牌, 传输路径);
        if (传输值) return;
        if (!值结果.hasError) {
          const {
            port: port,
            hostname: hostname,
            rawClientData: 原始客户端数据
          } = 值结果;
          authenticated('trojan', data.byteLength - 原始客户端数据.byteLength);
          try {
            await connectWebSocketTCP(hostname, port, 原始客户端数据, websocket, null, remote, fetcher, 出站配置, 连接取消.signal);
          } finally { releaseInput(原始客户端数据.byteLength); }
          return;
        }
      }
      throw new Error('Invalid protocol or authentication failed');
    }
  })).catch(关闭传输);
  return new Response(null, {
    status: 101,
    webSocket: 客户端值
  });
}
async function connectWebSocketTCP(主机, 端口数字, 原始数据, websocket, responseHeader, 远程连接值, fetcher, 配置快照, signal) {
  const attempts = outboundAttempts(配置快照, 主机, 端口数字, () => 获取回退目标(
    配置快照.回退地址, 配置快照.当前工作器地区, 配置快照.启用地区匹配, 端口数字));
  const payload = asBytes(原始数据);
  async function 连接值发送(address, port, 值代理 = false) {
    // 走代理时首包交给握手函数在释放写入器前发出，避免换写入器导致连接被重置
    const socket = await dialOutbound(address, port, payload, fetcher, 配置快照.已解析代理5配置, 值代理, signal);
    const writer = socket.writable.getWriter();
    return {
      remoteSock: socket,
      writer: writer
    };
  }
  function 处理值值当前(socket, writer) {
    if (远程连接值.socket !== socket) return;
    try {
      writer?.releaseLock();
    } catch {}
    远程连接值.socket = null;
    远程连接值.writer = null;
  }
  function 处理值远程(socket, writer, retry) {
    try {
      if (远程连接值.writer && 远程连接值.writer !== writer) {
        远程连接值.writer.releaseLock();
      }
    } catch {}
    远程连接值.socket = socket;
    远程连接值.writer = writer;
    远程连接值.drainUpload?.();
    socket.closed.catch(() => {}).finally(() => {
      if (远程连接值.socket === socket) closeWebSocket(websocket);
    });
    relayToWebSocket(socket, websocket, responseHeader, retry).finally(() => {
      if (远程连接值.socket === socket) {
        try {
          writer.releaseLock();
        } catch {}
        远程连接值.writer = null;
      }
    });
  }
  async function connectNext() {
    while (!signal.aborted) {
      const { value: attempt, done } = await attempts.next();
      if (done) { closeWebSocket(websocket); return; }
      try {
        const { remoteSock, writer } = await 连接值发送(attempt.address, attempt.port, attempt.viaProxy);
        处理值远程(remoteSock, writer, attempt.first ? () => {
          处理值值当前(remoteSock, writer);
          connectNext();
        } : null);
        return;
      } catch {}
    }
  }
  await connectNext();
}
function createUploadQueue(chunkSize, maxBytes = chunkSize, 项目列表上限 = Math.max(1, maxBytes >> 8)) {
  let 队列 = [];
  let head = 0;
  let queuedBytes = 0;
  let buffer = null;
  function compact() {
    if (head > 32 && head * 2 >= 队列.length) {
      队列 = 队列.slice(head);
      head = 0;
    }
  }
  function shift() {
    if (head >= 队列.length) return null;
    const data = 队列[head];
    队列[head++] = undefined;
    queuedBytes -= data.byteLength;
    compact();
    return data;
  }
  return {
    get empty() {
      return head >= 队列.length;
    },
    clear() {
      队列 = [];
      head = 0;
      queuedBytes = 0;
    },
    sow(data) {
      const 数量值 = data?.byteLength || 0;
      if (!数量值) return true;
      if (queuedBytes + 数量值 > maxBytes || 队列.length - head >= 项目列表上限) return false;
      队列.push(data);
      queuedBytes += 数量值;
      return true;
    },
    bundle() {
      const firstChunk = shift();
      if (!firstChunk || head >= 队列.length || firstChunk.byteLength >= chunkSize) return firstChunk;
      let totalBytes = firstChunk.byteLength;
      let 结束 = head;
      while (结束 < 队列.length) {
        const nextChunk = 队列[结束];
        const combinedBytes = totalBytes + nextChunk.byteLength;
        if (combinedBytes > chunkSize) break;
        totalBytes = combinedBytes;
        结束++;
      }
      if (结束 === head) return firstChunk;
      const 输出 = buffer ||= new Uint8Array(chunkSize);
      输出.set(firstChunk);
      let offset = firstChunk.byteLength;
      while (head < 结束) {
        const chunk = 队列[head];
        队列[head++] = undefined;
        queuedBytes -= chunk.byteLength;
        输出.set(chunk, offset);
        offset += chunk.byteLength;
      }
      compact();
      return 输出.subarray(0, totalBytes);
    }
  };
}
function createDownloadBatcher(websocket) {
  const bufferSize = 传输下载包大小;
  const 尾部 = 传输下载尾部;
  const minBatchSize = Math.max(4096, 尾部 << 3);
  let buffer = new Uint8Array(bufferSize);
  let 值字节 = 0;
  let 计时器 = 0;
  let scheduled = false;
  let writeVersion = 0;
  let 值键 = 0;
  let deferrals = 0;
  function 刷新() {
    if (计时器) clearTimeout(计时器);
    计时器 = 0;
    scheduled = false;
    if (!值字节) return;
    if (websocket.readyState === 1) websocket.send(buffer.subarray(0, 值字节).slice());
    buffer = new Uint8Array(bufferSize);
    值字节 = 0;
    deferrals = 0;
  }
  function 处理本地值() {
    if (计时器 || scheduled) return;
    scheduled = true;
    值键 = writeVersion;
    queueMicrotask(() => {
      scheduled = false;
      if (!值字节 || 计时器) return;
      if (bufferSize - 值字节 < 尾部) return 刷新();
      计时器 = setTimeout(() => {
        计时器 = 0;
        if (!值字节) return;
        if (bufferSize - 值字节 < 尾部) return 刷新();
        if (deferrals < 2 && (writeVersion !== 值键 || 值字节 < minBatchSize)) {
          deferrals++;
          值键 = writeVersion;
          return 处理本地值();
        }
        刷新();
      }, Math.max(传输下载延迟, 1));
    });
  }
  return {
    send(chunk) {
      const data = asBytes(chunk);
      let offset = 0;
      const length = data.byteLength;
      if (!length) return;
      while (offset < length) {
        if (!值字节 && length - offset >= bufferSize) {
          const sendSize = Math.min(bufferSize, length - offset);
          if (websocket.readyState === 1) websocket.send(offset || sendSize !== length ? data.subarray(offset, offset + sendSize) : data);
          offset += sendSize;
          continue;
        }
        const copySize = Math.min(bufferSize - 值字节, length - offset);
        buffer.set(data.subarray(offset, offset + copySize), 值字节);
        值字节 += copySize;
        offset += copySize;
        writeVersion++;
        if (值字节 === bufferSize || bufferSize - 值字节 < 尾部) 刷新();else 处理本地值();
      }
    },
    flush: 刷新
  };
}
function webSocketReadable(websocket, 值数据头部, reserveInput, signal) {
  let cancelled = false;
  let detach = () => {};
  return new ReadableStream({
    start(controller) {
      const finish = error => {
        if (cancelled) return;
        detach();
        if (error) controller.error(error); else controller.close();
      };
      const enqueue = chunk => {
        if (cancelled) return;
        const data = asBytes(chunk);
        if (reserveInput(data) && !cancelled) controller.enqueue(data);
      };
      const message = event => {
        try { enqueue(event.data); } catch (error) { finish(error); }
      };
      const closed = () => finish();
      const failed = event => finish(event.error || new Error('WebSocket error'));
      const aborted = () => finish(signal.reason);
      detach = () => {
        cancelled = true;
        websocket.removeEventListener('message', message);
        websocket.removeEventListener('close', closed);
        websocket.removeEventListener('error', failed);
        signal.removeEventListener('abort', aborted);
      };
      websocket.addEventListener('message', message);
      websocket.addEventListener('close', closed);
      websocket.addEventListener('error', failed);
      signal.addEventListener('abort', aborted, { once: true });
      if (signal.aborted) return aborted();
      const {
        earlyData: 值数据,
        error: error
      } = decodeEarlyData(值数据头部);
      if (error) finish(error); else if (值数据) enqueue(值数据);
    },
    cancel() {
      detach();
      closeWebSocket(websocket);
    }
  });
}
async function relayToWebSocket(远程套接字, websocket, 头部数据, 重试值) {
  let responseHeader = 头部数据,
    是否有数据 = false,
    failedOrRetried = false;

  // 关键：直连有时握手成功但远端长时间无数据，需要超时触发降级
  let 首次字节计时器 = null;
  if (重试值) {
    首次字节计时器 = setTimeout(() => {
      if (!是否有数据 && !failedOrRetried) {
        failedOrRetried = true;
        try {
          远程套接字.close && 远程套接字.close();
        } catch {}
        重试值();
      }
    }, 首字节超时);
  }
  const batcher = createDownloadBatcher(websocket);
  let reader = null;
  let byob = true;
  let buffer = new ArrayBuffer(传输块大小);
  try {
    try {
      reader = 远程套接字.readable.getReader({
        mode: 'byob'
      });
    } catch {
      byob = false;
      reader = 远程套接字.readable.getReader();
    }
    for (;;) {
      const result = byob ? await reader.read(new Uint8Array(buffer, 0, 传输块大小)) : await reader.read();
      if (result.done) break;
      const 读取值 = result.value;
      let chunk = asBytes(读取值);
      const 值缓冲 = byob && 读取值?.buffer instanceof ArrayBuffer && 读取值.buffer.byteLength >= 传输块大小 ? 读取值.buffer : new ArrayBuffer(传输块大小);
      if (!chunk.byteLength) continue;
      if (!是否有数据) {
        是否有数据 = true;
        if (首次字节计时器) {
          clearTimeout(首次字节计时器);
          首次字节计时器 = null;
        }
      }
      if (websocket.readyState !== 1) throw new Error(错误_网页套接字未打开);
      if (responseHeader) {
        chunk = concatBytes(responseHeader, chunk);
        responseHeader = null;
      }
      if (chunk.byteLength >= 传输块大小 >> 1) {
        batcher.flush();
        websocket.send(chunk);
        if (byob) buffer = new ArrayBuffer(传输块大小);
      } else {
        batcher.send(chunk.slice());
        if (byob) buffer = 值缓冲;
      }
    }
    batcher.flush();
  } catch {
    // 已经触发 retry 时不要关闭 WS（retry 会重新挂载新 socket）
    if (!failedOrRetried) closeWebSocket(websocket);
  } finally {
    try {
      batcher.flush();
    } catch {}
    try {
      reader?.releaseLock();
    } catch {}
  }
  if (首次字节计时器) {
    clearTimeout(首次字节计时器);
    首次字节计时器 = null;
  }
  if (!是否有数据 && !failedOrRetried && 重试值) 重试值();
}
// Count complete TCP DNS frames without buffering or rewriting their contents.
// Prefixes and bodies can span any number of WS/socket messages.
function dnsFrameCounter() {
  let prefixBytes = 0, length = 0, remaining = 0;
  return {
    get partial() { return prefixBytes !== 0 || remaining !== 0; },
    consume(data) {
      let frames = 0;
      for (let offset = 0; offset < data.byteLength;) {
        if (remaining) {
          const size = Math.min(remaining, data.byteLength - offset);
          remaining -= size; offset += size;
          if (!remaining) frames++;
        } else {
          length = (length << 8) | data[offset++];
          if (++prefixBytes === 2) {
            remaining = length;
            prefixBytes = 0; length = 0;
            if (!remaining) frames++;
          }
        }
      }
      return frames;
    }
  };
}
async function relayDNS(socket, websocket, responseHeader, payload, remote, signal) {
  const queries = dnsFrameCounter(), replies = dnsFrameCounter();
  let outstanding = 0, timer, awaitingResponse = false, reader;
  const stop = () => {
    clearTimeout(timer);
    remote.onUpload = null;
    try { reader?.cancel().catch(() => {}); } catch {}
  };
  const arm = () => {
    clearTimeout(timer);
    awaitingResponse = outstanding > 0 || queries.partial || replies.partial;
    timer = setTimeout(remote.close, awaitingResponse ? DNS响应超时 : DNS空闲超时);
  };
  remote.onUpload = data => {
    outstanding += queries.consume(data);
    // Extra queries and partial replies must not postpone an unanswered query.
    if (!awaitingResponse) arm();
  };
  signal.addEventListener('abort', stop, { once: true });
  try {
    if (signal.aborted) return;
    reader = socket.readable.getReader();
    remote.onUpload(payload);
    arm();
    for (;;) {
      const { value, done } = await reader.read();
      if (done || signal.aborted) break;
      const data = asBytes(value);
      if (!data.byteLength) continue;
      const answered = replies.consume(data);
      outstanding = Math.max(0, outstanding - answered);
      if (answered) arm();
      if (websocket.readyState !== 1) break;
      websocket.send(responseHeader ? concatBytes(responseHeader, data) : data);
      responseHeader = null;
    }
  } finally {
    stop();
    signal.removeEventListener('abort', stop);
    try { reader?.releaseLock(); } catch {}
    remote.close();
  }
}
async function forwardDNS(用户数据报块, 网页套接字, 值头部, remote, 请求值, 配置快照, signal) {
  for await (const attempt of outboundAttempts(配置快照, '8.8.4.4', 53)) {
    if (signal.aborted) break;
    let socket;
    try {
      socket = await dialOutbound(attempt.address, attempt.port, 用户数据报块, 请求值,
        配置快照.已解析代理5配置, attempt.viaProxy, signal, 1);
      if (signal.aborted) { socket.close(); return; }
      remote.socket = socket;
      remote.writer = socket.writable.getWriter();
      // Reading runs independently; the WS sink is free to accept more queries.
      relayDNS(socket, 网页套接字, 值头部, 用户数据报块, remote, signal).catch(remote.close);
      remote.drainUpload();
      return;
    } catch { try { socket?.close(); } catch {} }
  }
  remote.close();
}
async function connectXHTTP(首包, 请求值扩展, 配置快照, signal) {
  const attempts = outboundAttempts(配置快照, 首包.hostname, 首包.port, () => 获取回退目标(
    配置快照.回退地址, 配置快照.当前工作器地区, 配置快照.启用地区匹配, 首包.port));
  for await (const attempt of attempts) {
    if (signal?.aborted) break;
    try {
      const socket = await dialOutbound(attempt.address, attempt.port, null, 请求值扩展,
        配置快照.已解析代理5配置, attempt.viaProxy, signal);
      return createXHTTPRelay(首包, socket, 45_000, signal);
    } catch {}
  }
  return null;
}
async function handleXHTTPBody(body, 唯一标识, 请求值扩展, 配置快照, signal) {
  if (activeXHTTPConnections >= 上限值) {
    return new Response('Too many connections', {
      status: 429
    });
  }
  activeXHTTPConnections++;
  let released = false;
  const releaseSlot = () => {
    if (!released) {
      activeXHTTPConnections = Math.max(0, activeXHTTPConnections - 1);
      released = true;
    }
  };
  let 首包;
  let 已交付连接 = false;
  try {
    首包 = await readXHTTPHeader(body, 唯一标识, signal);
    const 远程连接 = await connectXHTTP(首包, 请求值扩展, 配置快照, signal);
    if (远程连接 === null) {
      return null;
    }
    const 连接值 = 远程连接.closed.finally(releaseSlot);
    已交付连接 = true;
    return {
      readable: 远程连接.readable,
      closed: 连接值
    };
  } catch (error) {
    if (error.name === 'TimeoutError') return new Response('XHTTP header timeout', { status: 408 });
    return null;
  } finally {
    if (!已交付连接) {
      releaseSlot();
      if (首包?.reader) {
        try { await 首包.reader.cancel(); } catch {}
        try { 首包.reader.releaseLock(); } catch {}
      }
    }
  }
}
export async function handleXHTTP(request, 配置快照) {

  try {
    return await handleXHTTPBody(request.body, 配置快照.认证令牌, request.fetcher, 配置快照, request.signal);
  } catch {
    return null;
  }
}
function decodeEarlyData(base64) {
  if (!base64) return {
    error: null
  };
  try {
    base64 = base64.replace(/-/g, '+').replace(/_/g, '/');
    return {
      earlyData: Uint8Array.from(atob(base64), char => char.charCodeAt(0)).buffer,
      error: null
    };
  } catch (error) {
    return {
      error: error
    };
  }
}
function closeWebSocket(套接字) {
  try {
    if (套接字.readyState === 1 || 套接字.readyState === 2) 套接字.close();
  } catch {}
}
