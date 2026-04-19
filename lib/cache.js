/**
 * Tiny in-process TTL cache.
 * No eviction by LRU — simple insertion-order eviction when `max` is exceeded.
 * Replace with Redis (Upstash) in Phase 3 when you deploy multiple instances.
 */
export class TTLCache {
  constructor({ ttlMs = 30_000, max = 500 } = {}) {
    this.ttl = ttlMs;
    this.max = max;
    this.map = new Map();
  }
  get(key) {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (Date.now() - entry.t > this.ttl) {
      this.map.delete(key);
      return null;
    }
    return entry.v;
  }
  set(key, value) {
    if (this.map.size >= this.max) {
      const oldest = this.map.keys().next().value;
      this.map.delete(oldest);
    }
    this.map.set(key, { t: Date.now(), v: value });
  }
  clear() { this.map.clear(); }
  size() { return this.map.size; }
}
