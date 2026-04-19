import { Router } from 'express';
import { getQuote } from '../providers/finnhub.js';

export const marketRouter = Router();

// ------------------------------------------------------------------
// GET /api/market/quote?sym=SPY
// Returns the same shape LiveData.quote() already expects.
// ------------------------------------------------------------------
marketRouter.get('/quote', async (req, res, next) => {
  try {
    const sym = cleanSym(req.query.sym || req.query.symbol);
    if (!sym) return res.status(400).json({ error: 'sym required' });
    const q = await getQuote(sym);
    if (!q) return res.status(404).json({ error: 'no-data' });
    res.json(q);
  } catch (e) { next(e); }
});

// ------------------------------------------------------------------
// GET /api/market/batch?syms=SPY,QQQ,NVDA
// One round-trip for the tape; max 20 symbols.
// ------------------------------------------------------------------
marketRouter.get('/batch', async (req, res, next) => {
  try {
    const raw = String(req.query.syms || req.query.symbols || '');
    const syms = raw.split(',')
      .map(cleanSym)
      .filter(Boolean)
      .slice(0, 20);
    if (!syms.length) return res.status(400).json({ error: 'syms required (comma-separated, max 20)' });

    const settled = await Promise.allSettled(syms.map(getQuote));
    const quotes = settled.map(r => (r.status === 'fulfilled' ? r.value : null));
    res.json({ quotes });
  } catch (e) { next(e); }
});

function cleanSym(v) {
  return String(v || '').toUpperCase().replace(/[^A-Z.\-]/g, '');
}
