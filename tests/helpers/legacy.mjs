import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';

export async function loadLegacy(file, options = {}) {
  let source = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
  if (Object.hasOwn(options, 'token')) {
    const assignment = /(?:let|const) 认证令牌 = '[^']*';/;
    assert.match(source, assignment);
    source = source.replace(assignment, `let 认证令牌 = ${JSON.stringify(options.token) ?? 'undefined'};`);
  }
  const attempts = [];
  const blocked = kind => () => {
    attempts.push(kind);
    throw new Error(`Unexpected legacy ${kind}`);
  };
  const context = createContext({
    Request, Response, Headers, URL, URLSearchParams, TextEncoder, TextDecoder,
    ReadableStream, WritableStream, TransformStream, Blob, atob, btoa,
    console: { log() {}, error() {} }, fetch: blocked('fetch'), ...options.globals
  });
  const sockets = new SyntheticModule(['connect'], function () {
    this.setExport('connect', options.connect ?? blocked('connect'));
  }, { context });
  const module = new SourceTextModule(source, { context, identifier: file });
  await module.link(specifier => {
    assert.equal(specifier, 'cloudflare:sockets');
    return sockets;
  });
  await module.evaluate({ timeout: 5000 });
  return { worker: module.namespace.default, attempts };
}
