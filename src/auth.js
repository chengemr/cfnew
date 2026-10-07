import { normalizePath } from './router.js';

const cookieName = 'cfnew_admin_session';
const sessionSeconds = 8 * 60 * 60;
const encoder = new TextEncoder();

const failure = (message, status) => Response.json({ success: false, error: message, message }, {
  status, headers: { 'Cache-Control': 'no-store', ...(status === 401 ? { 'WWW-Authenticate': 'Bearer' } : {}) }
});

function managementSecret(env, settings) {
  const secret = env.ADMIN_TOKEN || env.admin_token;
  if (typeof secret !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(secret)) return null;
  const subscriptionToken = settings.认证令牌.replaceAll('-', '').toLowerCase();
  let path = normalizePath(settings.自定义路径);
  // A shared link also exposes percent-encoded credentials after decoding.
  // Reject deeply encoded paths rather than allowing a disguised shared key.
  for (let depth = 0; path.includes('%'); depth++) {
    if (depth === 8) return null;
    let decoded;
    try { decoded = decodeURIComponent(path); } catch { break; }
    if (decoded === path) break;
    path = decoded;
  }
  path = normalizePath(path).replace(/^\/+|\/+$/g, '');
  if (secret.replaceAll('-', '').toLowerCase() === subscriptionToken || secret === path ||
    secret === String(settings.传输路径 || '')) return null;
  return secret;
}

function sameSecret(left, right) {
  const a = encoder.encode(left), b = encoder.encode(right);
  let difference = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) difference |= (a[i] || 0) ^ (b[i] || 0);
  return difference === 0;
}

function sameOrigin(request, requireSource = false) {
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site') return false;
  const origin = request.headers.get('Origin');
  const referer = request.headers.get('Referer');
  if (!origin && !referer) return !requireSource;
  try { return new URL(origin || referer).origin === new URL(request.url).origin; }
  catch { return false; }
}

async function signingKey(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function sessionMessage(request, payload) {
  return encoder.encode(`cfnew-admin:${new URL(request.url).hostname}:${payload}`);
}

function encodeSignature(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function validSession(request, secret) {
  const cookie = (request.headers.get('Cookie') || '').split(';').map(value => value.trim())
    .find(value => value.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
  const match = cookie?.match(/^(v1\.(\d{1,13}))\.([A-Za-z0-9_-]{43})$/);
  if (!match) return false;
  const expires = Number(match[2]);
  const now = Math.floor(Date.now() / 1000);
  if (expires <= now || expires > now + sessionSeconds + 1) return false;
  try {
    const signature = Uint8Array.from(atob(match[3].replaceAll('-', '+').replaceAll('_', '/') + '='), char => char.charCodeAt(0));
    if (encodeSignature(signature) !== match[3]) return false;
    return await crypto.subtle.verify('HMAC', await signingKey(secret), signature, sessionMessage(request, match[1]));
  } catch { return false; }
}

function cookieHeader(request, value, maxAge) {
  return `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}` +
    (new URL(request.url).protocol === 'https:' ? '; Secure' : '');
}

async function readLoginBody(request) {
  const reader = request.body?.getReader();
  if (!reader) return '';
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new DOMException('Login request timed out.', 'TimeoutError');
      reader.cancel(error).catch(() => {});
      reject(error);
    }, 5_000);
  });
  try {
    return await Promise.race([(async () => {
      const chunks = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4096) throw new Error('Login request too large.');
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    })(), timeout]);
  } finally {
    clearTimeout(timer);
    reader.cancel().catch(() => {});
    try { reader.releaseLock(); } catch {}
  }
}

export async function authorizeManagement(request, env, settings, page = false) {
  const secret = managementSecret(env, settings);
  if (!secret) return failure('Configure a separate ADMIN_TOKEN (32–256 letters, digits, _ or -) to enable management.', 503);
  const authorization = request.headers.get('Authorization');
  if (authorization) {
    const bearer = authorization.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/i)?.[1];
    if (!bearer || !sameSecret(bearer, secret)) return failure('Invalid management credential.', 401);
    // A Bearer credential does not use ambient cookies, but a cross-origin
    // browser request must still not be able to mutate this management API.
    if (!sameOrigin(request)) return failure('Cross-origin management requests are not allowed.', 403);
    return null;
  }
  if (!await validSession(request, secret)) {
    if (page && request.method === 'GET') return new Response(null, {
      status: 302, headers: { Location: '/', 'Cache-Control': 'no-store' }
    });
    return failure('Management authentication required.', 401);
  }
  if (!['GET', 'HEAD'].includes(request.method) && !sameOrigin(request, true)) {
    return failure('A same-origin request is required.', 403);
  }
  return null;
}

export async function handleManagementLogin(request, env, settings) {
  if (request.method !== 'POST') return failure('Method not allowed.', 405);
  const secret = managementSecret(env, settings);
  if (!secret) return failure('Configure a separate ADMIN_TOKEN (32–256 letters, digits, _ or -) to enable management.', 503);
  if (!sameOrigin(request)) return failure('Cross-origin management requests are not allowed.', 403);
  let token;
  try {
    if (Number(request.headers.get('Content-Length')) > 4096) {
      request.body?.cancel().catch(() => {});
      return failure('Invalid login request.', 400);
    }
    const body = await readLoginBody(request);
    token = JSON.parse(body)?.token;
  } catch (error) {
    return failure(error.name === 'TimeoutError' ? error.message : 'Invalid login request.', error.name === 'TimeoutError' ? 408 : 400);
  }
  if (typeof token !== 'string' || token.length > 256 || !sameSecret(token, secret)) {
    return failure('Invalid management credential.', 401);
  }
  const payload = `v1.${Math.floor(Date.now() / 1000) + sessionSeconds}`;
  const signature = encodeSignature(await crypto.subtle.sign('HMAC', await signingKey(secret), sessionMessage(request, payload)));
  return Response.json({ success: true }, {
    headers: { 'Cache-Control': 'no-store', 'Set-Cookie': cookieHeader(request, `${payload}.${signature}`, sessionSeconds) }
  });
}

export function handleManagementLogout(request) {
  if (request.method !== 'POST') return failure('Method not allowed.', 405);
  return Response.json({ success: true }, {
    headers: { 'Cache-Control': 'no-store', 'Set-Cookie': cookieHeader(request, '', 0) }
  });
}
