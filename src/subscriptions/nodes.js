import { isIPAddress } from '../preferred.js';
import { normalizeHost } from './links.js';
import { getPaddingKeys } from '../transports/padding.js';

const plainPorts = new Set([80, 8080, 8880, 2052, 2082, 2086, 2095]);

function cleanName(value, fallback) {
  let name = String(value || '').trim();
  if (!name || /^自定义优选-/i.test(name)) name = fallback;
  return name.replace(/^\[([^\]]+)\]$/, '$1').replace(/^https?:\/\//i, '')
    .replace(/[/?#].*$/, '').replace(/\s+/g, '_') || fallback;
}

export function createNodeNamer() {
  const counts = new Map();
  return node => {
    const host = normalizeHost(node.ip || node.domain || '');
    let name;
    if (host.includes(':') && /^[0-9a-fA-F:.]+$/.test(host)) name = 'IPv6优选';
    else if (host && !isIPAddress(host)) name = '优选域名';
    else {
      name = cleanName(node.isp || node.name, 'IPv4优选');
      const location = cleanName(node.colo, '');
      if (location) name += '-' + location;
    }
    const count = (counts.get(name) || 0) + 1;
    counts.set(name, count);
    return `${name}-${String(count).padStart(2, '0')}`;
  };
}

function portsFor(node, settings, explicit) {
  if (node.port || explicit) {
    const tls = !plainPorts.has(node.port);
    return tls || !settings.禁用非传输层安全 ? [{ port: node.port, tls }] : [];
  }
  return settings.禁用非传输层安全
    ? [{ port: 443, tls: true }]
    : [{ port: 443, tls: true }, { port: 80, tls: false }];
}

function parameters(protocol, transport, user, host, tls, settings) {
  const query = new URLSearchParams();
  if (protocol === 'vless') query.set('encryption', 'none');
  query.set('security', tls ? 'tls' : 'none');
  if (tls) { query.set('sni', host); query.set('fp', 'chrome'); }
  query.set('type', transport);
  query.set('host', host);
  query.set('path', transport === 'xhttp' ? '/' + user.slice(0, 8) : '/?ed=2048');
  if (transport === 'xhttp') {
    const { 头: header, 键: key } = getPaddingKeys(user);
    query.set('mode', 'stream-one');
    query.set('extra', JSON.stringify({ xPaddingObfsMode: true, xPaddingMethod: 'tokenish',
      xPaddingPlacement: 'queryInHeader', xPaddingHeader: header, xPaddingKey: key }));
  }
  if (tls && settings.自定义应用层协议协商) query.set('alpn', settings.自定义应用层协议协商);
  if (tls && settings.启用加密客户端问候) {
    query.set('ech', settings.自定义加密客户端问候域名 + '+' + settings.自定义域名系统);
  }
  return query;
}

// All sources use the same port/TLS decision and node order. Preserve the
// existing raw WS query spelling for remote preferred lists.
export function generateNodeLinks(settings, nodes, user, workerHost, nameNode, explicitPorts = false) {
  const protocols = [];
  if (settings.启用明文) protocols.push(['vless', 'ws']);
  if (settings.启用木马) protocols.push(['trojan', 'ws']);
  if (settings.启用扩展传输) protocols.push(['vless', 'xhttp']);
  const links = [];
  for (const [protocol, transport] of protocols) {
    const credential = protocol === 'trojan' ? settings.传输路径 || user : user;
    for (const node of nodes) {
      const host = normalizeHost(node.ip);
      const address = host.includes(':') ? `[${host}]` : host;
      const ports = transport === 'xhttp' ? [{ port: node.port || 443, tls: true }]
        : portsFor(node, settings, explicitPorts);
      for (const { port, tls } of ports) {
        const query = parameters(protocol, transport, user, workerHost, tls, settings);
        const serialized = explicitPorts && transport === 'ws'
          ? [...query].map(([key, value]) => key + '=' + (key === 'path' ? value : encodeURIComponent(value))).join('&')
          : query.toString();
        links.push(`${protocol}://${encodeURIComponent(credential)}@${address}:${port}?${serialized}#${encodeURIComponent(nameNode(node))}`);
      }
    }
  }
  return links;
}
