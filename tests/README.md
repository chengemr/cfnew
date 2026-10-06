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
writes, input boundaries, residential subscriptions, outbound DNS policy, proxy
handshakes, cancellation, and XHTTP lifetime and stream cleanup using a virtual
clock. The BYOB fixture adapts Cloudflare's readAtLeast extension to Node streams.

`ws-dns-guards.test.mjs` keeps DNS upstream connections open across queries,
splits TCP length prefixes, combines frames, and verifies unanswered/partial
response deadlines and disconnect cleanup. It also covers WS entry reservations
through stalled dials, handshakes and writes, early data, the 256 KiB limit and
the five-second authentication deadline. `subscription-failure.test.mjs` checks
HTTP errors, timeouts, empty/invalid source contents and disabled-source behavior
for Base64, Clash and Sing-box. Existing source tests still assert body deadlines,
timer/reader cleanup and rejection of HTTP error bodies as node lists.

Browser and native Mihomo tests are separate from `test:all`:

```sh
npx playwright install --with-deps chromium
npm run test:browser
bash scripts/install-mihomo.sh /tmp/cfnew-bin
CFNEW_MIHOMO_BIN=/tmp/cfnew-bin/mihomo npm run test:mihomo
```

Set `CFNEW_WORKER_FILE=少年你相信光吗` to exercise the obfuscated artifact.
The installer pins the official Linux x86_64 Mihomo release and verifies its
SHA-256 digest. On other platforms, supply an installed binary instead.
CI runs both artifacts with Chromium and Mihomo, as well as Node 18/24 regression
checks. These tests use local fixtures; they do not replace a public Worker/Pages
deployment or public proxy connectivity checks. See CONTRIBUTING.md for details.
