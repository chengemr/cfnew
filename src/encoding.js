const 基础64文本解码器 = new TextDecoder();
export function decodeBase64Text(文本) {
  const 二进制 = atob(文本);
  const 字节 = new Uint8Array(二进制.length);
  for (let 索引 = 0; 索引 < 二进制.length; 索引++) 字节[索引] = 二进制.charCodeAt(索引);
  return 基础64文本解码器.decode(字节);
}
