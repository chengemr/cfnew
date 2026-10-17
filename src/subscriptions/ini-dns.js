import { isIPAddress, normalizePort, parseAddress } from '../preferred.js';
import { SubscriptionCompatibilityError } from './errors.js';

const defaultDoH = 'https://223.5.5.5/dns-query';
const backupDoH = 'https://1.12.12.12/dns-query';

function dnsError(client, detail) {
  return new SubscriptionCompatibilityError(`当前 ${client} 格式${detail}，请修改 DNS 地址或使用 Clash / Sing-box 格式。`);
}

function normalizeDNSHost(value) {
  const host = String(value || '').replace(/^\[([^\]]+)\]$/, '$1');
  if (isIPAddress(host)) return host;
  if (!host || /[:,/?#@\[\]\\\s]/.test(host)) return '';
  try {
    const normalized = new URL('http://' + host).hostname;
    // URL normalization can decode percent escapes in hostnames into INI delimiters.
    return /[:,/?#@\[\]\\\s\u0000-\u001f\u007f]/.test(normalized) ? '' : normalized;
  } catch { return ''; }
}

function parseDNS(value, client) {
  const text = String(value || defaultDoH).trim();
  // INI lists cannot represent literal commas or control characters in a URL.
  if (!text || /[,\s\u0000-\u001f\u007f]/.test(text)) throw dnsError(client, '无法表示此 DNS 地址');
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(text)) {
    let url;
    try { url = new URL(text); } catch { throw dnsError(client, '的 DNS 地址无效'); }
    const scheme = url.protocol.slice(0, -1).toLowerCase();
    const host = normalizeDNSHost(url.hostname);
    const port = normalizePort(url.port);
    if (!host || url.username || url.password || url.hash || url.port && port === null) {
      throw dnsError(client, '的 DNS 地址无效');
    }
    if (scheme === 'https' || scheme === 'h3' || scheme === 'http3') {
      if (scheme === 'http3') url.protocol = 'h3:';
      return { type: scheme === 'http3' ? 'h3' : scheme, host, port, url };
    }
    if (!['udp', 'dns', 'tls', 'quic'].includes(scheme)) {
      throw dnsError(client, `不支持 ${scheme.toUpperCase()} DNS`);
    }
    if (url.search || url.pathname && url.pathname !== '/') throw dnsError(client, '的 DNS 地址不能包含路径或查询参数');
    return { type: scheme === 'dns' ? 'udp' : scheme, host, port, url };
  }
  const { address, port } = parseAddress(text);
  const host = normalizeDNSHost(address);
  if (!host) throw dnsError(client, '的 DNS 地址无效');
  return { type: 'udp', host, port };
}

function udpAddress({ host, port }) {
  return (host.includes(':') ? '[' + host + ']' : host) + (port ? ':' + port : '');
}

function withBackup(url) {
  return [...new Set([url, backupDoH])].join(', ');
}

// Client syntax follows their DNS documentation and official sample profiles:
// Surge: encrypted-dns-server (HTTPS/H3/QUIC/TLS).
// Loon: Loon0x00/LoonExampleConfig/example2.lcf (DoH/DoH3/DoQ).
// Quantumult X: crossutility/Quantumult-X/sample.conf (DoH/DoQ/prefer-doh3).
export function renderIniDNS(value, client) {
  const endpoint = parseDNS(value, client);
  const address = endpoint.type === 'udp' ? udpAddress(endpoint) : '223.5.5.5';
  if (client === 'Quantumult X') {
    const lines = ['server=' + address, ...(address === '119.29.29.29' ? [] : ['server=119.29.29.29'])];
    if (endpoint.type === 'udp') return lines;
    if (endpoint.type === 'quic') return [...lines, 'doq-server=' + endpoint.url.href];
    if (endpoint.type === 'https') return [...lines, 'doh-server=' + withBackup(endpoint.url.href)];
    if (endpoint.type === 'h3') {
      // QX selects HTTP/3 with an explicit preference instead of an h3:// URI.
      const url = endpoint.url.href.replace(/^h3:/, 'https:');
      return [...lines, 'prefer-doh3', 'doh-server=' + withBackup(url)];
    }
    throw dnsError(client, `不支持 ${endpoint.type.toUpperCase()} DNS`);
  }
  const separator = client === 'Surge' ? ', ' : ',';
  const lines = ['dns-server = ' + [...new Set([address, '119.29.29.29', 'system'])].join(separator)];
  if (endpoint.type === 'udp') return lines;
  if (client === 'Surge') {
    return [...lines, 'encrypted-dns-server = ' + (endpoint.type === 'https'
      ? withBackup(endpoint.url.href) : endpoint.url.href)];
  }
  if (endpoint.type === 'https') return [...lines, 'doh-server = ' + withBackup(endpoint.url.href)];
  if (endpoint.type === 'h3') return [...lines, 'doh3-server = ' + endpoint.url.href];
  if (endpoint.type === 'quic') {
    // Loon defaults DoQ to 784; the standard quic:// DNS endpoint defaults to 853.
    if (!endpoint.port) endpoint.url.port = '853';
    return [...lines, 'doq-server = ' + endpoint.url.href];
  }
  throw dnsError(client, `不支持 ${endpoint.type.toUpperCase()} DNS`);
}
