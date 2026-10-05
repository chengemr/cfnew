import { connect as 连接 } from 'cloudflare:sockets';
import { decodeBase64Text as 解码64, concatBytes, textDecoder as 共享解码器 } from '../encoding.js';
import { parseAddress as 解析地址值端口 } from '../preferred.js';

// One deadline covers TCP opening, the proxy handshake and the first write.
// Keep the disconnect listener until the established sockets have closed.
async function withConnectionDeadline(operation, signal, timeout = 5_000) {
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

// Resolve fallback addresses only if needed. WS additionally retries its first
// dial when no reply arrives; DNS supplies no ProxyIP fallback.
export async function* outboundAttempts(settings, address, port, fallback) {
  const { 是否代理已启用: enabled, 仅走代理: only, 启用代理降级: directFirst } = settings;
  if (only && !enabled) return;
  yield { address, port, viaProxy: enabled && (only || !directFirst), first: true };
  if (only) return;
  if (directFirst && enabled) yield { address, port, viaProxy: true };
  if (fallback) yield { ...await fallback(), viaProxy: enabled && !directFirst };
}

const 官方直连地址 = 解码64('MTcyLjcxLjIxOC4xOTAsMTYyLjE1OC4yMjguODcsMTYyLjE1OC4xODkuMTM0LDE2Mi4xNTguMjYuNjMsMTYyLjE1OC4yNS44NiwxNjIuMTU4LjI5LjIxNiwxNjIuMTU4LjIxOC4xNjAsMTYyLjE1OC4yMjcuMjE0LDE3Mi42OS4xMTguMTk4LDE3Mi42OS4xMTkuMTUw').split(',');
function 取官方直连地址() {
  const 命中 = 官方直连地址[Math.floor(Math.random() * 官方直连地址.length)];
  return {
    domain: 命中,
    port: 443
  };
}
const 地区回退域名 = new Map([
  ["HK", "ProxyIP.HK.CMLiussss.net"],
  ["US", "ProxyIP.US.CMLiussss.net"],
  ["SG", "ProxyIP.SG.CMLiussss.net"],
  ["JP", "ProxyIP.JP.CMLiussss.net"],
  ["KR", "ProxyIP.KR.CMLiussss.net"],
  ["DE", "ProxyIP.DE.CMLiussss.net"],
  ["SE", "ProxyIP.SE.CMLiussss.net"],
  ["NL", "ProxyIP.NL.CMLiussss.net"],
  ["FI", "ProxyIP.FI.CMLiussss.net"],
  ["GB", "ProxyIP.GB.CMLiussss.net"],
]);
export async function 获取值备用地址(地区 = '', 地区匹配 = true) {
  if (!地区 || 地区 === 'CF') return 取官方直连地址();
  return { domain: 地区回退域名.get(地区匹配 ? 地区 : 'HK') || 地区回退域名.get('US'), port: 443 };
}
export async function 获取回退目标(回退地址, 地区, 地区匹配, 端口) {
  if (回退地址 && 回退地址.trim()) {
    const 已解析 = 解析地址值端口(回退地址);
    return { address: 已解析.address, port: 已解析.port || 端口 };
  }
  const 备用 = await 获取值备用地址(地区, 地区匹配);
  return { address: 备用.domain, port: 备用.port };
}
const 错误_代理无可用方法 = "no acceptable methods";
const 错误_代理需要认证 = "socks server needs auth";
const 错误_代理认证失败 = "fail to auth socks server";
const 错误_代理连接失败 = "fail to open socks connection";
const 错误_代理隧道失败 = "fail to open proxy tunnel";
const 错误_代理响应异常 = "invalid proxy response";
const 代理种类_隧道 = 'pt';
const 代理种类_安全隧道 = 'pts';
const 传输连接竞速数 = 2;
function openSocket(address, port, fetcher, open) {
  const 目标 = {
    hostname: address,
    port: port
  };
  return open(() => fetcher && typeof fetcher.connect === 'function' ? fetcher.connect(目标) : 连接(目标));
}
async function openSocketWithFallback(address, port, fetcher, open, close) {
  let socket;
  try {
    socket = openSocket(address, port, fetcher, open);
    if (socket?.opened) await socket.opened;
    return socket;
  } catch (error) {
    if (socket) close(socket);
    if (!fetcher) throw error;
    const fallbackSocket = open(() => 连接({
      hostname: address,
      port: port
    }));
    if (fallbackSocket?.opened) await fallbackSocket.opened;
    return fallbackSocket;
  }
}
async function raceSockets(address, port, fetcher, 竞速数量, open, close) {
  const 数量 = Math.max(1, 竞速数量 | 0);
  const 待连接 = new Set();
  let 已选定 = false;
  const 跟踪打开 = create => {
    if (已选定) throw new Error('Connection race finished');
    const socket = open(create); 待连接.add(socket); return socket;
  };
  const attempts = Array.from({
    length: 数量
  }, () => openSocketWithFallback(address, port, fetcher, 跟踪打开, close));
  const winner = await Promise.any(attempts);
  已选定 = true;
  for (const socket of 待连接) if (socket !== winner) close(socket);
  // A fetcher failure can start its global fallback after another attempt won.
  attempts.forEach(promise => promise.then(socket => {
    if (socket !== winner) close(socket);
  }, () => {}));
  return winner;
}
export function dialOutbound(address, port, data, fetcher, proxy, viaProxy, signal, races = 传输连接竞速数) {
  return withConnectionDeadline(async (open, close) => {
    if (viaProxy) return connectSOCKS(address, port, proxy, fetcher, data, open);
    const socket = await raceSockets(address, port, fetcher, races, open, close);
    if (data?.byteLength) {
      const writer = socket.writable.getWriter();
      try { await writer.write(data); } finally { writer.releaseLock(); }
    }
    return socket;
  }, signal);
}
async function connectSOCKS(address, port, 代理配置, fetcher, 首包数据, open) {
  // 按代理种类分派：隧道走建隧请求，其余保持套接字5 握手
  if (代理配置 && (代理配置.kind === 代理种类_隧道 || 代理配置.kind === 代理种类_安全隧道)) {
    return connectHTTP(address, port, 代理配置, fetcher, 首包数据, open);
  }
  const {
    username: username,
    password: password,
    hostname: proxyHost,
    socksPort: proxyPort
  } = 代理配置;
  // 优先用请求自带的 fetcher 建连，回退到全局连接
  const socket = openSocket(proxyHost, proxyPort, fetcher, open);
  let writer = null;
  let reader = null;
  try {
    if (socket.opened) await socket.opened;
    writer = socket.writable.getWriter();
    await writer.write(new Uint8Array(username ? [5, 2, 0, 2] : [5, 1, 0]));
    reader = socket.readable.getReader();
    // 响应可能分片到达，按需累积到足够长度再解析；残留字节留给下一步
    let 残留字节 = new Uint8Array(0);
    async function 读满(需要长度) {
      while (残留字节.length < 需要长度) {
        const { value: 分片, done: 已结束 } = await reader.read();
        if (已结束 || !分片) throw new Error(错误_代理连接失败);
        残留字节 = concatBytes(残留字节, 分片);
      }
      return 残留字节;
    }
    function 取走(长度) {
      const 结果 = 残留字节.subarray(0, 长度);
      残留字节 = 残留字节.subarray(长度);
      return 结果;
    }
    let reply = await 读满(2);
    if (reply[0] !== 5 || reply[1] === 255) throw new Error(错误_代理无可用方法);
    const 选中方法 = reply[1];
    取走(2);
    if (选中方法 === 2) {
      if (!username || !password) throw new Error(错误_代理需要认证);
      const encoder = new TextEncoder();
      const 用户字节 = encoder.encode(username), 密码字节 = encoder.encode(password);
      if (用户字节.length > 255 || 密码字节.length > 255) throw new Error(错误_代理认证失败);
      const 认证请求 = new Uint8Array([1, 用户字节.length, ...用户字节, 密码字节.length, ...密码字节]);
      await writer.write(认证请求);
      reply = await 读满(2);
      if (reply[0] !== 1 || reply[1] !== 0) throw new Error(错误_代理认证失败);
      取走(2);
    }
    // 统一用域名型寻址，避免 VLESS / Trojan 不同的地址类型编号影响 SOCKS 握手。
    const encoder = new TextEncoder();
    const 目标字节 = encoder.encode(normalizeTarget(address));
    if (目标字节.length > 255) throw new Error(错误_代理连接失败);
    const targetAddress = new Uint8Array([3, 目标字节.length, ...目标字节]);
    await writer.write(new Uint8Array([5, 1, 0, ...targetAddress, port >> 8, port & 255]));
    // 连接应答长度随绑定地址类型而变，先读固定的 4 字节头再按类型补齐
    reply = await 读满(4);
    if (reply[1] !== 0) throw new Error(错误_代理连接失败);
    const 绑定地址类型 = reply[3];
    let 应答长度;
    if (绑定地址类型 === 1) {
      应答长度 = 10;
    } else if (绑定地址类型 === 4) {
      应答长度 = 22;
    } else if (绑定地址类型 === 3) {
      应答长度 = 7 + (await 读满(5))[4];
    } else {
      throw new Error(错误_代理响应异常);
    }
    await 读满(应答长度);
    取走(应答长度);
    // 首包必须在释放写入器之前发出，与握手共用同一个写入器
    if (首包数据 && 首包数据.byteLength) await writer.write(首包数据);
    writer.releaseLock();
    reader.releaseLock();
    // 应答之后若已捎带目标数据，重新挂回流首部，避免丢首包
    if (残留字节.length) return prependSocket(socket, 残留字节);
    return socket;
  } catch (代理错误) {
    try { writer?.releaseLock(); } catch {}
    try { reader?.releaseLock(); } catch {}
    throw 代理错误;
  }
}
function normalizeTarget(address) {
  const 文本 = String(address || '');
  return /^\[.*\]$/.test(文本) ? 文本.slice(1, -1) : 文本;
}
async function connectHTTP(address, port, 代理配置, fetcher, payload, open) {
  const {
    username: 隧道用户,
    password: 隧道密码,
    hostname: 隧道主机,
    socksPort: 隧道端口,
    kind: 隧道种类
  } = 代理配置;
  const 连接选项 = 隧道种类 === 代理种类_安全隧道 ? {
    secureTransport: 'on',
    allowHalfOpen: false
  } : undefined;
  const 目标参数 = {
    hostname: 隧道主机,
    port: 隧道端口
  };
  // 优先用请求自带的 fetcher 建连，回退到全局连接
  const 套接字 = open(() => fetcher && typeof fetcher.connect === 'function' ? (连接选项 === undefined ? fetcher.connect(目标参数) : fetcher.connect(目标参数, 连接选项)) : 连接(目标参数, 连接选项));
  if (套接字?.opened) await 套接字.opened;
  // IPv6 目标在请求行里要带方括号
  const 目标主机 = address.includes(':') && !/^\[.*\]$/.test(address) ? `[${address}]` : address;
  const 目标地址 = `${目标主机}:${port}`;
  let 请求头 = `CONNECT ${目标地址} HTTP/1.1\r\n` + `Host: ${目标地址}\r\n` + `User-Agent: Mozilla/5.0\r\n` + `Proxy-Connection: Keep-Alive\r\n`;
  if (隧道用户) {
    请求头 += `Proxy-Authorization: Basic ${btoa(String.fromCharCode(...new TextEncoder().encode(`${隧道用户}:${隧道密码 || ''}`)))}\r\n`;
  }
  请求头 += '\r\n';
  const 写入器 = 套接字.writable.getWriter();
  const 读取器 = 套接字.readable.getReader();
  try {
    await 写入器.write(new TextEncoder().encode(请求头));
    // 响应可能分片到达，累积到头部结束（空行）为止
    const 分隔 = [13, 10, 13, 10];
    let 缓冲 = new Uint8Array(0);
    let 头部结束 = -1;
    while (头部结束 < 0) {
      const {
        value: 分片,
        done: 已结束
      } = await 读取器.read();
      if (已结束 || !分片) throw new Error(错误_代理隧道失败);
      缓冲 = concatBytes(缓冲, 分片);
      for (let 位置 = 0; 位置 + 3 < 缓冲.length; 位置++) {
        if (缓冲[位置] === 分隔[0] && 缓冲[位置 + 1] === 分隔[1] && 缓冲[位置 + 2] === 分隔[2] && 缓冲[位置 + 3] === 分隔[3]) {
          头部结束 = 位置 + 4;
          break;
        }
      }
      if (头部结束 < 0 && 缓冲.length > 8192) throw new Error(错误_代理响应异常);
    }
    const 状态行 = 共享解码器.decode(缓冲.subarray(0, Math.min(头部结束, 128)));
    if (!状态行.startsWith("HTTP/")) throw new Error(错误_代理响应异常);
    const 状态码 = Number(状态行.split(' ')[1]);
    if (!(状态码 >= 200 && 状态码 < 300)) throw new Error(错误_代理隧道失败);
    // 代理在头部之后可能已经捎带了目标数据，需要交还给下游
    const 残留数据 = 缓冲.subarray(头部结束);
    // 首包在释放写入器之前发出
    if (payload && payload.byteLength) await 写入器.write(payload);
    写入器.releaseLock();
    读取器.releaseLock();
    if (残留数据.byteLength) return prependSocket(套接字, 残留数据);
    return 套接字;
  } catch (隧道错误) {
    try {
      写入器.releaseLock();
    } catch {}
    try {
      读取器.releaseLock();
    } catch {}
    throw 隧道错误;
  }
}
function prependSocket(套接字, 残留数据) {
  let 上游读取器 = null;
  const 新可读 = new ReadableStream({
    start(控制器) {
      控制器.enqueue(残留数据);
      上游读取器 = 套接字.readable.getReader();
    },
    async pull(控制器) {
      const {
        value: 分片,
        done: 已结束
      } = await 上游读取器.read();
      if (已结束) {
        控制器.close();
        return;
      }
      控制器.enqueue(分片);
    },
    cancel(原因) {
      try {
        上游读取器?.cancel(原因);
      } catch {}
    }
  });
  return {
    readable: 新可读,
    writable: 套接字.writable,
    closed: 套接字.closed,
    opened: 套接字.opened,
    close: () => 套接字.close()
  };
}
