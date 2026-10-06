import { defaults } from './config.js';
import { parseProxy } from './transports/proxy.js';
import { normalizePath } from './router.js';

const switches = new Set(['ev', 'et', 'ex', 'ech', 'ena', 'epd', 'epi', 'egi', 'dkby',
  'ipv4', 'ipv6', 'ispMobile', 'ispUnicom', 'ispTelecom', 'jk', 'ae', 'rm', 'yxby']);
const switchValues = new Set(['yes', 'no', 'true', 'false', '1', '0', 'on', 'off']);
const alpnValues = new Set(['h3', 'h2', 'http/1.1', 'h3,h2', 'h2,http/1.1', 'h3,h2,http/1.1']);

export function validateConfig(changes) {
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return '配置必须是 JSON 对象';
  for (const [key, value] of Object.entries(changes)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key) || key.length > 128) return '无效的配置键';
    if (value === null || value === '') continue;
    if (JSON.stringify(value).length > (key === 'yx' ? 256 * 1024 : 8192)) return key + ' 过长';
    if (!Object.hasOwn(defaults, key)) continue; // Preserve extension fields.
    if (switches.has(key)) {
      if (!['string', 'number', 'boolean'].includes(typeof value) || !switchValues.has(String(value).trim().toLowerCase())) return key + ' 必须是开关值';
      continue;
    }
    if (typeof value !== 'string') return key + ' 必须是字符串';
    if (key === 'qj' && !['no', 'only'].includes(value.toLowerCase())) return '无效的出站方式';
    if (key === 'alpn' && !alpnValues.has(value.trim())) return '无效的 ALPN';
    // DNS also supports TLS, QUIC, UDP, bare hosts and IPv6; keep their formats.
    if (['homepage', 'yxURL', 'scu'].includes(key)) {
      try { if (!['http:', 'https:'].includes(new URL(value).protocol)) return key + ' 仅支持 HTTP(S)'; }
      catch { return key + ' 必须是完整 URL'; }
    }
    if (key === 's') {
      try { parseProxy(value); } catch { return '无效的上游代理地址'; }
    }
    if (key === 'd') {
      const path = normalizePath(value);
      if (path === '/' || /\s|[?#]/.test(value) || value.includes('//') ||
        new URL(path, 'https://path.invalid').pathname !== path) return '无效的管理路径';
    }
  }
  return null;
}

export function validatePreferredName(name) {
  return name === undefined || name === null || name === '' || (typeof name === 'string' && name.length <= 256 && !/[,#\r\n]/.test(name));
}
