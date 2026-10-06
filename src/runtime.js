import { defaults, resolveConfig } from './config.js';
import { parsePreferredSources } from './preferred.js';
import { parseProxy } from './transports/proxy.js';

export function getAuthenticationToken(env) {
  const token = env.u || env.U;
  if (typeof token !== 'string') return null;
  const normalized = token.trim().toLowerCase();
  return /^(?:[0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/.test(normalized) ? normalized : null;
}

export function createSettings(env, stored) {
  const config = Object.freeze(resolveConfig(env, stored));
  const { addresses, domains } = parsePreferredSources(config.yx);
  const region = String(config.wk || '').trim().toUpperCase();
  const fallback = String(config.p || '').trim();
  const proxyMode = String(config.qj || '').toLowerCase();
  const alpn = String(config.alpn || '').trim();
  let proxy = {};
  let proxyEnabled = false;
  if (config.s) {
    try { proxy = parseProxy(config.s); proxyEnabled = true; } catch {}
  }
  return Object.freeze({
    config,
    认证令牌: getAuthenticationToken(env),
    手动工作器地区: region,
    当前工作器地区: region || (fallback ? 'CUSTOM' : 'CF'),
    启用地区匹配: String(config.rm || '').toLowerCase() !== 'no',
    启用明文: config.ev === 'yes',
    启用木马: config.et === 'yes',
    启用扩展传输: config.ex === 'yes',
    传输路径: config.tp || '',
    启用优选域名: config.epd === 'yes',
    启用优选地址: config.epi === 'yes',
    启用仓库优选: config.egi === 'yes',
    启用原生地址: config.ena === 'yes',
    启用家宽链式: config.jk === 'yes',
    启用加密客户端问候: config.ech === 'yes',
    自定义域名系统: String(config.customDNS || '').trim() || defaults.customDNS,
    自定义加密客户端问候域名: String(config.customECHDomain || '').trim() || defaults.customECHDomain,
    自定义应用层协议协商: ['', 'h3', 'h2', 'http/1.1', 'h3,h2', 'h2,http/1.1', 'h3,h2,http/1.1'].includes(alpn) ? alpn : '',
    禁用非传输层安全: config.dkby === 'yes',
    启用代理降级: proxyMode === 'no',
    仅走代理: proxyMode === 'only',
    自定义路径: config.d || '',
    优选地址源: config.yxURL || '',
    回退地址: fallback,
    已解析代理5配置: Object.freeze(proxy),
    是否代理已启用: proxyEnabled,
    禁用优选: String(config.yxby || '').toLowerCase() === 'yes',
    自定义优选地址列表: addresses,
    自定义优选域名列表: domains
  });
}
