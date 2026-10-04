# Worker regression tests

These tests use Node's built-in runner and the development-only YAML parser.
Run them from the repository root with Node 18 or later:

```sh
npm ci
npm run build
npm test
```

To run the same tests against the obfuscated Worker:

```sh
npm run obfuscate
npm run test:all
```

Each test loads a fresh instance of the real Worker module and invokes its
`fetch` entry point. Cloudflare socket connections and `fetch` network access
are blocked by default; source tests provide explicit in-memory HTTP fixtures.
No regression test contacts an external server. KV storage is simulated in memory.

The tests cover subscription fields, routing, concurrent configuration reads and
writes, residential subscriptions, and XHTTP lifetime and stream cleanup using
a virtual clock. The BYOB fixture adapts Cloudflare's readAtLeast extension to
Node streams. These tests do not replace a real Worker deployment or native
client connectivity tests. See CONTRIBUTING.md for the optional Mihomo test.
