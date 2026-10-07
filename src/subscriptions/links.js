import { decodeBase64Text as 解码64 } from '../encoding.js';

export function quoteYaml(取值621) {
  return JSON.stringify(String(取值621 ?? ''));
}

export function normalizeHost(主机名619) {
  if (!主机名619) return 主机名619;
  const 头值618 = String(主机名619);
  if (头值618.startsWith('[') && 头值618.endsWith(']')) return 头值618.slice(1, -1);
  return 头值618;
}

export function parseShareLink(链接603) {
  try {
    if (链接603.startsWith(解码64('dmxlc3M6Ly8='))) {
      const 网址602 = new URL(链接603);
      const 参数值601 = new URLSearchParams(网址602.search);
      return {
        proto: 解码64('dmxlc3M='),
        name: decodeURIComponent(网址602.hash.substring(1)) || 网址602.hostname + ':' + 网址602.port,
        uuid: 网址602.username,
        server: normalizeHost(网址602.hostname),
        port: parseInt(网址602.port) || 443,
        tls: 参数值601.get('security') === 'tls' || 参数值601.get('security') === 解码64('cmVhbGl0eQ=='),
        network: 参数值601.get('type') || 'ws',
        path: 参数值601.get('path') || '/?ed=2048',
        host: normalizeHost(参数值601.get('host') || 网址602.hostname),
        sni: normalizeHost(参数值601.get('sni') || 参数值601.get('host') || 网址602.hostname),
        alpn: (参数值601.get('alpn') || '').split(',').map(字符串值600 => 字符串值600.trim()).filter(Boolean),
        fp: 参数值601.get('fp') || 'chrome',
        flow: 参数值601.get('flow') || '',
        encryption: 参数值601.get('encryption') || 'none',
        mode: 参数值601.get('mode') || '',
        ech: 参数值601.get('ech') || ''
      };
    }
    if (链接603.startsWith(解码64('dHJvamFuOi8v'))) {
      const 网址599 = new URL(链接603);
      const 参数值 = new URLSearchParams(网址599.search);
      return {
        proto: 解码64('dHJvamFu'),
        name: decodeURIComponent(网址599.hash.substring(1)) || 网址599.hostname + ':' + 网址599.port,
        password: decodeURIComponent(网址599.username),
        server: normalizeHost(网址599.hostname),
        port: parseInt(网址599.port) || 443,
        tls: 参数值.get('security') !== 'none',
        network: 参数值.get('type') || 'ws',
        path: 参数值.get('path') || '/?ed=2048',
        host: normalizeHost(参数值.get('host') || 网址599.hostname),
        sni: normalizeHost(参数值.get('sni') || 参数值.get('host') || 网址599.hostname),
        alpn: (参数值.get('alpn') || '').split(',').map(字符串值598 => 字符串值598.trim()).filter(Boolean),
        fp: 参数值.get('fp') || 'chrome',
        ech: 参数值.get('ech') || ''
      };
    }
  } catch (事件值597) {}
  return null;
}
