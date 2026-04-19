import { TTLCache } from '../lib/cache.js';

const FINNHUB_URL = 'https://finnhub.io/api/v1/quote';
const TTL_MS = 30_000;

const cache = new TTLCache({ ttlMs: TTL_MS, max: 500 });

/**
 * Fetch a single-symbol quote from Finnhub.
 * Returns the same shape LiveData.quote() already expects, or null on no-data.
 */
export async function getQuote(sym) {
  const key = process.env.FINNHUB_KEY;
  if (!key) {
    const err = new Error('FINNHUB_KEY missing on server');
    err.status = 500;
    throw err;
  }

  // Cache hit → return immediately
  const hit = cache.get(sym);
  if (hit) return hit;

  const url = `${FINNHUB_URL}?symbol=${encodeURIComponent(sym)}&token=${encodeURIComponent(key)}`;
  const r = await fetch(url);
  if (!r.ok) return null;

  const j = await r.json();
  // Finnhub returns c:0, pc:0 when no data for symbol
  if (!j || (j.c === 0 && j.pc === 0)) return null;

  const change = j.c - j.pc;
  const pct = j.pc ? (change / j.pc) * 100 : 0;
  const q = {
    symbol: sym,
    price: j.c,
    change,
    changePct: pct,
    up: change >= 0,
    prevClose: j.pc,
    high: j.h,
    low: j.l,
    time: j.t,
  };

  cache.set(sym, q);
  return q;
}
