import { isIPAddress, normalizePort } from '../preferred.js';

export function parseProxy(input) {
  let address = String(input || '').trim();
  const scheme = address.match(/^(socks5?|https?):\/\//i)?.[1].toLowerCase();
  const kind = scheme === 'https' ? 'pts' : scheme === 'http' ? 'pt' : 'p5';
  if (scheme) address = address.slice(scheme.length + 3);
  address = address.split('/')[0]; // Keep the legacy optional trailing path.
  const invalid = () => { throw new Error('Invalid SOCKS address format'); };
  const at = address.lastIndexOf('@');
  let username, password;
  if (at >= 0) {
    const auth = address.slice(0, at).split(':');
    if (auth.length !== 2) invalid();
    [username, password] = auth;
    address = address.slice(at + 1);
  }
  const bracketed = address.match(/^\[([^\]]+)\](?::(.*))?$/);
  let hostname, port;
  if (bracketed) {
    if (!bracketed[1].includes(':') || !isIPAddress(bracketed[1])) invalid();
    hostname = `[${bracketed[1]}]`;
    port = bracketed[2];
  } else {
    const parts = address.split(':');
    if (parts.length > 2) invalid();
    [hostname, port] = parts;
    if (!hostname || /[\s@?#\[\]]/.test(hostname)) invalid();
  }
  const socksPort = port === undefined && kind !== 'p5' ? (kind === 'pts' ? 443 : 80) : normalizePort(port);
  if (socksPort === null) invalid();
  if (kind === 'p5' && [username, password].some(value => new TextEncoder().encode(value || '').length > 255)) invalid();
  return { username, password, hostname, socksPort, kind };
}
