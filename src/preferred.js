export function normalizePort(value, defaultPort = null) {
  if (value === undefined || value === null || value === '') return defaultPort;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) return null;
  const port = Number(text);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

export function parseAddress(输入) {
  const text = String(输入 || '').trim();
  // An unbracketed IPv6 address always represents the complete address.
  if (isIPAddress(text)) return { address: text, port: null };
  const bracketed = text.match(/^\[([^\]]+)\](?::(.*))?$/);
  if (bracketed && bracketed[1].includes(':') && isIPAddress(bracketed[1])) {
    const port = normalizePort(bracketed[2]);
    if (bracketed[2] === undefined || port !== null) return { address: bracketed[1], port };
  }
  const separator = text.lastIndexOf(':');
  if (separator > 0) {
    const address = text.slice(0, separator);
    const port = normalizePort(text.slice(separator + 1));
    if (!address.includes(':') && port !== null) return { address, port };
  }
  return { address: text, port: null };
}

export function isIPAddress(地址792) {
  if (typeof 地址792 !== 'string') return false;
  const 值4正则 = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  if (值4正则.test(地址792)) return true;
  if (!地址792.includes(':') || !/^[0-9a-fA-F:.]+$/.test(地址792)) return false;
  try { return new URL(`http://[${地址792}]/`).hostname.startsWith('['); }
  catch { return false; }
}

export function isDomain(域名) {
  const 域名正则 = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  return 域名正则.test(域名);
}

function entries(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean).map(item => {
    const [address, name] = item.split('#');
    const parsed = parseAddress(address.trim());
    return { ip: parsed.address, port: parsed.port, name: name?.trim() || '' };
  }).filter(node => node.ip && (isIPAddress(node.ip) || !/[:\[\]]/.test(node.ip)));
}

export function parsePreferredList(value) {
  return entries(value).map(node => ({ ...node, port: node.port || 443,
    name: node.name || node.ip + (node.port ? ':' + node.port : ''), addedAt: new Date().toISOString() }));
}

export function serializePreferredList(list) {
  return list.map(node => {
    const host = node.ip.includes(':') ? '[' + node.ip + ']' : node.ip;
    return host + ':' + (node.port || 443) + '#' + node.name;
  }).join(',');
}

export function parsePreferredSources(value) {
  const addresses = [], domains = [];
  for (const node of entries(value)) {
    const name = node.name || '自定义优选-' + node.ip + (node.port ? ':' + node.port : '');
    if (isIPAddress(node.ip)) addresses.push({ ip: node.ip, port: node.port, isp: name });
    else domains.push({ domain: node.ip, port: node.port, name });
  }
  return { addresses, domains };
}
