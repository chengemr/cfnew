const stores = new WeakMap();
const cacheTTL = 30_000;
const fullRefreshTTL = 5 * 60_000;

// Caches belong to a binding; requests receive a snapshot, never mutable globals.
export function getConfigStore(binding) {
  if (!binding) return null;
  if (stores.has(binding)) return stores.get(binding);

  let snapshot = Object.freeze({});
  let version = '';
  let loadedAt = null;
  let refreshedAt = null;
  let pendingRead;
  let readError = null;
  let writes = Promise.resolve();

  async function read() {
    if (loadedAt !== null && Date.now() - loadedAt < cacheTTL) return snapshot;
    if (pendingRead) return pendingRead;
    pendingRead = (async () => {
      try {
        let nextVersion = '';
        try { nextVersion = await binding.get('c_ver') || ''; } catch {}
        if (refreshedAt !== null && Date.now() - refreshedAt < fullRefreshTTL
          && nextVersion && nextVersion === version) {
          loadedAt = Date.now();
          readError = null;
          return snapshot;
        }
        const raw = await binding.get('c');
        const config = raw ? JSON.parse(raw) : {};
        if (!config || typeof config !== 'object' || Array.isArray(config)) {
          throw new Error('Invalid KV configuration');
        }
        snapshot = Object.freeze(config);
        version = nextVersion;
        loadedAt = Date.now();
        refreshedAt = loadedAt;
        readError = null;
      } catch (error) {
        // Keep the last successful snapshot; a failed refresh remains retryable.
        readError = error;
      }
      return snapshot;
    })().finally(() => { pendingRead = null; });
    return pendingRead;
  }

  const store = {
    async load() {
      await writes;
      const current = await read();
      // Before the first successful read, even the management path is unknown.
      // Refuse to resolve routes from defaults that could bypass a KV override.
      if (loadedAt === null && readError) throw new Error('KV configuration unavailable', { cause: readError });
      return current;
    },
    update(transform) {
      const result = writes.then(async () => {
        const current = await read();
        // Reads may serve the last good snapshot during an outage. Writes must
        // not overwrite unknown or newer KV data with that fallback snapshot.
        if (readError) throw new Error('KV configuration unavailable', { cause: readError });
        const next = transform({ ...current });
        if (!next) return current;
        await binding.put('c', JSON.stringify(next));
        // Publish only after saving succeeds. UUIDs avoid same-millisecond collisions.
        snapshot = Object.freeze(next);
        version = crypto.randomUUID();
        loadedAt = Date.now();
        refreshedAt = loadedAt;
        try { await binding.put('c_ver', version); } catch {}
        return snapshot;
      });
      writes = result.catch(() => {});
      return result;
    }
  };
  stores.set(binding, store);
  return store;
}
