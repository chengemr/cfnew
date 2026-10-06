function ipv6Address(bytes, offset) {
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 16);
  return Array.from({ length: 8 }, (_, index) => view.getUint16(index * 2).toString(16)).join(':');
}

import { asBytes, concatBytes, textDecoder as 共享解码器 } from '../encoding.js';

const 地址类型_四版 = 1;
const 地址类型_网址 = 2;
const 地址类型_六版 = 3;
const 唯一标识字节缓存 = new Map();
const 值超文本缓冲大小 = 128 * 1024;
const 连接超时值 = 5000;
function getUUIDBytes(token) {
  if (唯一标识字节缓存.has(token)) return 唯一标识字节缓存.get(token);
  const 十六进制 = String(token || '').replace(/-/g, '');
  if (十六进制.length !== 32) return null;
  const bytes = new Uint8Array(16);
  for (let index = 0; index < 16; index++) {
    const byte = Number.parseInt(十六进制.slice(index * 2, index * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    bytes[index] = byte;
  }
  if (唯一标识字节缓存.size > 16) 唯一标识字节缓存.clear();
  唯一标识字节缓存.set(token, bytes);
  return bytes;
}
function matchesUUID(bytes, offset, token) {
  const id = getUUIDBytes(token);
  return !!id && id.every((byte, index) => bytes[offset + index] === byte);
}
export function parseVlessHeader(packet, 令牌) {
  const bytes = asBytes(packet);
  if (bytes.byteLength < 24) return { hasError: true };
  const version = bytes.subarray(0, 1);
  if (!matchesUUID(bytes, 1, 令牌)) return { hasError: true };
  const optionsLength = bytes[17];
  const 命令索引 = 18 + optionsLength;
  if (bytes.byteLength < 命令索引 + 5) return { hasError: true };
  const command = bytes[命令索引];
  let 是否用户数据报 = false;
  if (command === 1) {} else if (command === 2) {
    是否用户数据报 = true;
  } else {
    return { hasError: true };
  }
  const portIndex = 19 + optionsLength;
  const port = bytes[portIndex] << 8 | bytes[portIndex + 1];
  let addressIndex = portIndex + 2,
    addressLength = 0,
    地址值索引 = addressIndex + 1,
    hostname = '';
  const addressType = bytes[addressIndex];
  switch (addressType) {
    case 地址类型_四版:
      addressLength = 4;
      if (bytes.byteLength < 地址值索引 + addressLength) return { hasError: true };
      hostname = `${bytes[地址值索引]}.${bytes[地址值索引 + 1]}.${bytes[地址值索引 + 2]}.${bytes[地址值索引 + 3]}`;
      break;
    case 地址类型_网址:
      if (bytes.byteLength < 地址值索引 + 1) return { hasError: true };
      addressLength = bytes[地址值索引++];
      if (bytes.byteLength < 地址值索引 + addressLength) return { hasError: true };
      hostname = 共享解码器.decode(bytes.subarray(地址值索引, 地址值索引 + addressLength));
      break;
    case 地址类型_六版:
      addressLength = 16;
      if (bytes.byteLength < 地址值索引 + addressLength) return { hasError: true };
      hostname = ipv6Address(bytes, 地址值索引);
      break;
    default:
      return { hasError: true };
  }
  if (!hostname) return { hasError: true };
  return {
    hasError: false,
    port: port,
    hostname: hostname,
    isUDP: 是否用户数据报,
    rawIndex: 地址值索引 + addressLength,
    version: version
  };
}
export async function parseTrojanHeader(packet, token, 传输路径 = '') {
  const 字节 = asBytes(packet);
  const 密码值井号 = 传输路径 || token;
  const expectedHash = await sha224(密码值井号);
  if (字节.byteLength < 56) {
    return { hasError: true };
  }
  let 值值索引 = 56;
  if (字节[56] !== 0x0d || 字节[57] !== 0x0a) {
    return { hasError: true };
  }
  const passwordHash = 共享解码器.decode(字节.subarray(0, 值值索引));
  if (passwordHash !== expectedHash) {
    return { hasError: true };
  }
  const requestData = 字节.subarray(值值索引 + 2);
  if (requestData.byteLength < 6) {
    return { hasError: true };
  }
  const view = new DataView(requestData.buffer, requestData.byteOffset, requestData.byteLength);
  const command = view.getUint8(0);
  if (command !== 1) {
    return { hasError: true };
  }
  const addressType = view.getUint8(1);
  let 地址长度 = 0;
  let addressOffset = 2;
  let hostname = "";
  switch (addressType) {
    case 1:
      地址长度 = 4;
      hostname = requestData.subarray(addressOffset, addressOffset + 地址长度).join(".");
      break;
    case 3:
      地址长度 = requestData[addressOffset];
      addressOffset += 1;
      hostname = 共享解码器.decode(requestData.subarray(addressOffset, addressOffset + 地址长度));
      break;
    case 4:
      地址长度 = 16;
      hostname = ipv6Address(requestData, addressOffset);
      break;
    default:
      return { hasError: true };
  }
  if (!hostname) {
    return { hasError: true };
  }
  const portOffset = addressOffset + 地址长度;
  const 端口远程 = new DataView(requestData.buffer, requestData.byteOffset + portOffset, 2).getUint16(0);
  return {
    hasError: false,
    port: 端口远程,
    hostname: hostname,
    rawClientData: requestData.subarray(portOffset + 4)
  };
}
async function sha224(text) {
  const 编码器 = new TextEncoder();
  const message = 编码器.encode(text);
  const roundConstants = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  let 头部游标 = [0xc1059ed8, 0x367cd507, 0x3070dd17, 0xf70e5939, 0xffc00b31, 0x68581511, 0x64f98fa7, 0xbefa4fa4];
  const 消息长度 = message.length;
  const bitLength = 消息长度 * 8;
  const paddedLength = Math.ceil((消息长度 + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[消息长度] = 0x80;
  const 视图 = new DataView(padded.buffer);
  视图.setUint32(paddedLength - 4, bitLength, false);
  for (let blockOffset = 0; blockOffset < paddedLength; blockOffset += 64) {
    const 写入器包装 = new Uint32Array(64);
    for (let index = 0; index < 16; index++) {
      写入器包装[index] = 视图.getUint32(blockOffset + index * 4, false);
    }
    for (let index = 16; index < 64; index++) {
      const sigma0 = rotateRight(写入器包装[index - 15], 7) ^ rotateRight(写入器包装[index - 15], 18) ^ 写入器包装[index - 15] >>> 3;
      const sigma1 = rotateRight(写入器包装[index - 2], 17) ^ rotateRight(写入器包装[index - 2], 19) ^ 写入器包装[index - 2] >>> 10;
      写入器包装[index] = 写入器包装[index - 16] + sigma0 + 写入器包装[index - 7] + sigma1 >>> 0;
    }
    let [a, 乙值, c, d, e, 表单值, g, h] = 头部游标;
    for (let round = 0; round < 64; round++) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = e & 表单值 ^ ~e & g;
      const temp1 = h + sum1 + choice + roundConstants[round] + 写入器包装[round] >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = a & 乙值 ^ a & c ^ 乙值 & c;
      const temp2 = sum0 + majority >>> 0;
      h = g;
      g = 表单值;
      表单值 = e;
      e = d + temp1 >>> 0;
      d = c;
      c = 乙值;
      乙值 = a;
      a = temp1 + temp2 >>> 0;
    }
    头部游标[0] = 头部游标[0] + a >>> 0;
    头部游标[1] = 头部游标[1] + 乙值 >>> 0;
    头部游标[2] = 头部游标[2] + c >>> 0;
    头部游标[3] = 头部游标[3] + d >>> 0;
    头部游标[4] = 头部游标[4] + e >>> 0;
    头部游标[5] = 头部游标[5] + 表单值 >>> 0;
    头部游标[6] = 头部游标[6] + g >>> 0;
    头部游标[7] = 头部游标[7] + h >>> 0;
  }
  const digest = [];
  for (let index = 0; index < 7; index++) {
    digest.push((头部游标[index] >>> 24 & 0xff).toString(16).padStart(2, '0'), (头部游标[index] >>> 16 & 0xff).toString(16).padStart(2, '0'), (头部游标[index] >>> 8 & 0xff).toString(16).padStart(2, '0'), (头部游标[index] & 0xff).toString(16).padStart(2, '0'));
  }
  return digest.join('');
}
function rotateRight(value, bits) {
  return value >>> bits | value << 32 - bits;
}
export async function readXHTTPHeader(body, 唯一标识字符串, signal) {
  const reader = body.getReader({
    mode: 'byob'
  });
  let 已超时 = false;
  const abort = () => { reader.cancel(signal.reason).catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const 超时标识 = setTimeout(() => {
    已超时 = true;
    reader.cancel().catch(() => {});
  }, 连接超时值);
  try {
    let result = await reader.readAtLeast(1 + 16 + 1, new Uint8Array(值超文本缓冲大小));
    if (!result.value || result.value.length < 1 + 16 + 1) {
      throw new Error('header too short');
    }
    let bufferedLength = 0;
    let 索引 = 0;
    let 缓存 = result.value;
    bufferedLength += result.value.length;
    const version = 缓存[0];
    if (!matchesUUID(缓存, 1, 唯一标识字符串)) {
      throw new Error(`invalid UUID`);
    }
    const optionsLength = 缓存[1 + 16];
    const addressOffset = 1 + 16 + 1 + optionsLength + 1 + 2 + 1;
    if (addressOffset + 1 > bufferedLength) {
      if (result.done) {
        throw new Error(`header too short`);
      }
      索引 = addressOffset + 1 - bufferedLength;
      result = await reader.readAtLeast(索引, new Uint8Array(值超文本缓冲大小));
      if (!result.value || result.value.length < 索引) {
        throw new Error('header too short');
      }
      bufferedLength += result.value.length;
      缓存 = concatBytes(缓存, result.value);
    }
    const 命令 = 缓存[1 + 16 + 1 + optionsLength];
    if (命令 !== 1) {
      throw new Error(`unsupported command: ${命令}`);
    }
    const port = (缓存[addressOffset - 1 - 2] << 8) + 缓存[addressOffset - 1 - 1];
    const addressType = 缓存[addressOffset - 1];
    let 头部长度 = -1;
    if (addressType === 地址类型_四版) {
      头部长度 = addressOffset + 4;
    } else if (addressType === 地址类型_六版) {
      头部长度 = addressOffset + 16;
    } else if (addressType === 地址类型_网址) {
      头部长度 = addressOffset + 1 + 缓存[addressOffset];
    }
    if (头部长度 < 0) {
      throw new Error('read address type failed');
    }
    索引 = 头部长度 - bufferedLength;
    if (索引 > 0) {
      if (result.done) {
        throw new Error(`read address failed`);
      }
      result = await reader.readAtLeast(索引, new Uint8Array(值超文本缓冲大小));
      if (!result.value || result.value.length < 索引) {
        throw new Error('read address failed');
      }
      bufferedLength += result.value.length;
      缓存 = concatBytes(缓存, result.value);
    }
    let hostname = '';
    索引 = addressOffset;
    switch (addressType) {
      case 地址类型_四版:
        hostname = 缓存.slice(索引, 索引 + 4).join('.');
        break;
      case 地址类型_网址:
        hostname = new TextDecoder().decode(缓存.slice(索引 + 1, 索引 + 1 + 缓存[索引]));
        break;
      case 地址类型_六版:
        hostname = ipv6Address(缓存, 索引);
        break;
    }
    if (hostname.length < 1) {
      throw new Error('failed to parse hostname');
    }
    const 数据 = 缓存.slice(头部长度);
    return {
      hostname: hostname,
      port: port,
      data: 数据,
      resp: new Uint8Array([version, 0]),
      reader: reader,
      done: result.done
    };
  } catch (error) {
    try { await reader.cancel(); } catch {}
    try {
      reader.releaseLock();
    } catch {}
    if (已超时) throw new DOMException('XHTTP header timeout', 'TimeoutError');
    throw error;
  } finally {
    clearTimeout(超时标识);
    signal?.removeEventListener('abort', abort);
  }
}
