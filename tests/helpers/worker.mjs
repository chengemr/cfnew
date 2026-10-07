import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

export const UUID = '11111111-1111-4111-8111-111111111111';
export const ORIGIN = 'https://worker.example';
export const ADMIN_TOKEN = 'test-management-token-0123456789abcdef0123456789abcdef';

export function environment(overrides = {}) {
  return {
    u: UUID, ADMIN_TOKEN, ev: 'yes', et: 'yes', ex: 'yes', dkby: 'yes',
    epd: 'yes', epi: 'yes', egi: 'no', ena: 'no',
    ...overrides
  };
}

export function mockKV(configuration = {}, version = '1') {
  const data = new Map([['c', JSON.stringify(configuration)], ['c_ver', version]]);
  const reads = [];
  const writes = [];
  return {
    data, reads, writes,
    async get(key) {
      reads.push(key);
      return data.get(key) ?? null;
    },
    async put(key, value) {
      writes.push(key);
      data.set(key, value);
    }
  };
}

// Load the actual Worker module. Only Cloudflare's socket import and network
// access are mocked; the request entry point and subscription code are unmodified.
export async function loadWorker(t, options = {}) {
  let now = 1_000_000;
  class Clock extends Date {
    static now() { return now; }
  }
  const networkAttempts = [];
  const blocked = kind => () => {
    networkAttempts.push(kind);
    throw new Error(`${kind} is disabled in regression tests`);
  };
  const context = createContext({
    Request, Response, Headers, URL, URLSearchParams, TextEncoder, TextDecoder, DOMException,
    ReadableStream, WritableStream, TransformStream, ByteLengthQueuingStrategy, AbortController,
    atob, btoa, crypto: webcrypto, console, setTimeout, clearTimeout, setInterval, clearInterval,
    queueMicrotask, Date: Clock, fetch: blocked('fetch'), ...options.globals
  });
  const sockets = new SyntheticModule(['connect'], function () {
    this.setExport('connect', options.connect ?? blocked('connect'));
  }, { context });
  const file = process.env.CFNEW_WORKER_FILE
    ? resolve(process.env.CFNEW_WORKER_FILE)
    : fileURLToPath(new URL('../../明文源吗', import.meta.url));
  const module = new SourceTextModule(await readFile(file, 'utf8'), {
    context, identifier: file
  });
  await module.link(specifier => {
    assert.equal(specifier, 'cloudflare:sockets', 'unexpected Worker import');
    return sockets;
  });
  await module.evaluate({ timeout: 5000 });
  t.after(() => assert.deepEqual(networkAttempts, [], 'Worker attempted network access'));
  return {
    worker: module.namespace.default,
    advanceTime(milliseconds) { now += milliseconds; }
  };
}

export function request(worker, env, path = `/${UUID}/sub`, options) {
  const headers = new Headers(options?.headers);
  if (!headers.has('Authorization') && env.ADMIN_TOKEN) headers.set('Authorization', `Bearer ${env.ADMIN_TOKEN}`);
  return worker.fetch(new Request(ORIGIN + path, { ...options, headers }), env, {
    waitUntil() { throw new Error('Unexpected background task'); }
  });
}

export async function subscription(worker, env, path = `/${UUID}/sub`) {
  const response = await request(worker, env, path);
  assert.equal(response.status, 200);
  const text = await response.text();
  return text ? atob(text).split('\n').filter(Boolean).map(link => new URL(link)) : [];
}

export function nodeFields(link) {
  return {
    protocol: link.protocol.slice(0, -1),
    transport: link.searchParams.get('type'),
    server: link.hostname.replace(/^\[|\]$/g, ''),
    port: Number(link.port),
    tls: link.searchParams.get('security') === 'tls'
  };
}
