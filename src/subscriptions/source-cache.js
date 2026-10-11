const freshTTL = 3 * 60_000;
const staleTTL = 15 * 60_000;
const capacity = 32;
const entries = new Map();

// Cache bounded, parsed source data, before applying request-specific filters.
// Generated subscriptions and their proxy credentials are never cached.
export async function cachedSource(key, load) {
  let entry = entries.get(key);
  if (entry) {
    entries.delete(key);
    entries.set(key, entry);
    if (entry.value && Date.now() - entry.savedAt < freshTTL) return entry.value;
    if (entry.pending) return entry.pending;
    if (entry.value && Date.now() < entry.retryAt && Date.now() - entry.savedAt < staleTTL) return entry.value;
  } else {
    if (entries.size >= capacity) {
      const oldest = [...entries].find(([, candidate]) => !candidate.pending);
      // Do not evict an active load or start unlimited uncached fetches.
      if (!oldest) return [];
      entries.delete(oldest[0]);
    }
    entry = { value: null, savedAt: 0, retryAt: 0, pending: null };
    entries.set(key, entry);
  }
  entry.pending = Promise.resolve().then(load).then(value => {
    if (!value.length) throw new Error('Empty preferred source');
    entry.value = Object.freeze(value.map(node => Object.freeze(node)));
    entry.savedAt = Date.now();
    entry.retryAt = 0;
    return entry.value;
  }).catch(() => {
    // A failed refresh never extends the age of the last successful data.
    entry.retryAt = Date.now() + 15_000;
    return entry.value && Date.now() - entry.savedAt < staleTTL ? entry.value : [];
  }).finally(() => { entry.pending = null; });
  return entry.pending;
}
