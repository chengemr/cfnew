export const textDecoder = new TextDecoder();
export function decodeBase64Text(文本) {
  const 二进制 = atob(文本);
  const 字节 = new Uint8Array(二进制.length);
  for (let 索引 = 0; 索引 < 二进制.length; 索引++) 字节[索引] = 二进制.charCodeAt(索引);
  return textDecoder.decode(字节);
}

export function asBytes(chunk) {
  if (chunk instanceof Uint8Array) return chunk;
  if (chunk instanceof ArrayBuffer) return new Uint8Array(chunk);
  if (ArrayBuffer.isView(chunk)) return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  return new Uint8Array(chunk);
}
export function concatBytes(first, second) {
  const firstBytes = asBytes(first);
  const secondBytes = asBytes(second);
  const result = new Uint8Array(firstBytes.byteLength + secondBytes.byteLength);
  result.set(firstBytes);
  result.set(secondBytes, firstBytes.byteLength);
  return result;
}
