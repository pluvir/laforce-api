import { Router } from 'express';
import { callAnthropic } from '../providers/anthropic.js';

export const aiRouter = Router();

const SYS_DEFAULT = 'You are an elite institutional investment intelligence system for LaForce Capital. You combine the analytical rigor of Goldman Sachs, the macro awareness of Ray Dalio, and the direct communication of Warren Buffett.\n\nPrinciples:\n1. BE DECISIVE. Give clear verdicts.\n2. BE SPECIFIC. Use real numbers, percentages, price targets, timeframes.\n3. BE INSTITUTIONAL.\n4. BE HONEST. Acknowledge risks clearly.\n5. FORMAT CLEANLY. No markdown symbols.\n\nNot a licensed financial advisor.';

// ------------------------------------------------------------------
// POST /api/ai/raw  — generic passthrough (matches current aiCall signature)
// This unblocks every AI path with a single client-side fetch swap.
// ------------------------------------------------------------------
aiRouter.post('/raw', async (req, res, next) => {
  try {
    const { prompt, sys, maxTokens } = req.body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt (string) required' });
    }
    const text = await callAnthropic({
      prompt,
      sys: sys || SYS_DEFAULT,
      maxTokens: clampTokens(maxTokens, 1200),
    });
    res.json({ text });
  } catch (e) { next(e); }
});

// ------------------------------------------------------------------
// POST /api/ai/stock-analysis
// Body: { ticker, mode: 'quick'|'full', marketCtx, holdings[] }
// ------------------------------------------------------------------
aiRouter.post('/stock-analysis', async (req, res, next) => {
  try {
    const { ticker, mode, marketCtx, holdings } = req.body || {};
    if (!ticker) return res.status(400).json({ error: 'ticker required' });
    const t = String(ticker).toUpperCase().replace(/[^A-Z.]/g, '');
    if (!t) return res.status(400).json({ error: 'ticker must contain A-Z' });

    const full = mode === 'full';
    const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const regime = regimeString(marketCtx);
    const ownsLine = ownershipLine(t, holdings);

    const prompt = `INSTITUTIONAL ${full ? 'FULL' : 'QUICK'} ANALYSIS: ${t}

Context:
- Market regime: ${regime}
- ${ownsLine}
- Today: ${today}

Respond in EXACTLY this format, using these labels on their own lines. No markdown, no asterisks.

VERDICT: [BUY / ADD / HOLD / TRIM / AVOID] - [one decisive sentence]

CONFIDENCE: [1-10] - [one sentence on what drives the score]

THESIS: [2-3 sentences on the specific thesis]

WHY NOW: [2-3 sentences on timing trigger — specific catalyst in next 1-6 months]

SIGNAL: [Raw fundamental read — valuation vs history, earnings direction, sector momentum]

CONVICTION: [Moat, durability, management quality]
${full ? `
VALUATION: [P/E, EV/EBITDA, PEG, peer comparison]

MOMENTUM: [Price action, technical setup, key support/resistance levels]

CATALYSTS: [2-3 near-term catalysts, each on own line starting with a hyphen]
` : `
KEY NUMBER: [The single metric that matters most right now]
`}
WHAT BREAKS THE THESIS: [3 specific risks, each on own line starting with a hyphen]

POSITION SIZING: [Explicit recommendation — "Right-sized at 3-5%", "Starter 1-2%", mention max cap]

ENTRY APPROACH: [Market today / Limit at $X / DCA over N weeks]

TIMING WINDOW: ["Enter within [N days/weeks]" or "Wait for [specific signal/date]"]

TIME HORIZON: [Hold period + what to watch]

WAIT FOR IF NOT NOW: [Specific trigger — price level, earnings confirmation, macro event]

FINAL ACTION: [One sentence starting with a verb: Buy, Add, Trim, Hold, Wait, or Avoid]`;

    const text = await callAnthropic({
      prompt,
      sys: SYS_DEFAULT,
      maxTokens: full ? 2000 : 1100,
    });
    res.json({ text, ticker: t, mode: full ? 'full' : 'quick' });
  } catch (e) { next(e); }
});

// ------------------------------------------------------------------
// POST /api/ai/portfolio-study
// Body: { holdings[], marketCtx }
// ------------------------------------------------------------------
aiRouter.post('/portfolio-study', async (req, res, next) => {
  try {
    const { holdings, marketCtx } = req.body || {};
    if (!Array.isArray(holdings) || !holdings.length) {
      return res.status(400).json({ error: 'holdings (non-empty array) required' });
    }
    const total = holdings.reduce((s, h) => s + (Number(h.mktVal) || 0), 0);
    const topN = holdings.slice().sort((a, b) => (b.mktVal || 0) - (a.mktVal || 0)).slice(0, 30);
    const summary = topN.map(h => `${h.sym}: ${h.shares || 0}sh @ $${h.costPerShare || 0} = $${h.mktVal || 0}`).join('\n');
    const regime = regimeString(marketCtx);

    const prompt = `PORTFOLIO FEASIBILITY STUDY

Total value: $${total.toFixed(0)}
Position count: ${holdings.length}
Market regime: ${regime}

Top holdings by value:
${summary}

Produce a complete feasibility study using these EXACT section headers (each on its own line, all caps):

PORTFOLIO HEALTH
[Letter grade A-F. 2-3 sentences on overall structure — concentration, quality, balance.]

FRAMEWORK
[Allocation framework — Core / Growth / Tactical breakdown. Target vs observed.]

GROWTH PROJECTIONS
[Bear / Base / Bull projections at 1y / 5y / 10y horizons with specific dollar figures.]

ACTION PLAN
[Numbered list. Group as "HIGH PRIORITY" then "MEDIUM PRIORITY" then "ONGOING". Each action specific.]

RECOMMENDED ADDITIONS
[Specific tickers with rationale, each on own line starting with a hyphen.]

BEHAVIORAL
[Behavioral risks specific to this portfolio — concentration bias, anchoring, etc.]

No markdown symbols. Be specific, use real numbers, reference the actual holdings.`;

    const text = await callAnthropic({
      prompt,
      sys: SYS_DEFAULT,
      maxTokens: 2400,
    });
    res.json({ text, totalValue: total, positionCount: holdings.length });
  } catch (e) { next(e); }
});

// ------------------------------------------------------------------
// POST /api/ai/deployment
// Body: { cash, style, notes, holdings[], marketCtx }
// Server attempts to parse Anthropic's JSON response and returns both raw + parsed.
// ------------------------------------------------------------------
aiRouter.post('/deployment', async (req, res, next) => {
  try {
    const { cash, style, notes, holdings, marketCtx } = req.body || {};
    const cashNum = Number(cash);
    if (!cashNum || cashNum <= 0) return res.status(400).json({ error: 'cash (> 0) required' });

    const styleClean = ['conservative', 'balanced', 'aggressive', 'income', 'momentum', 'dip'].includes(style) ? style : 'balanced';
    const portCtx = Array.isArray(holdings) && holdings.length
      ? (() => {
          const t = holdings.reduce((s, h) => s + (h.mktVal || 0), 0);
          return holdings.slice(0, 10).map(x => `${x.sym}(${t ? ((x.mktVal / t) * 100).toFixed(0) : 0}%)`).join(', ');
        })()
      : 'No portfolio loaded';
    const regime = regimeString(marketCtx);

    const sys = 'You are an elite institutional portfolio manager. You MUST respond with ONLY a valid JSON object. No markdown, no code blocks, no prose before or after. Just raw JSON.';

    const prompt = `Deploy $${cashNum.toLocaleString()} with ${styleClean} risk bias.
Existing portfolio: ${portCtx}
Market: ${regime}${notes ? `\nGoals: ${notes}` : ''}

Respond with ONLY this JSON (populate all 3 strategies, 5-7 real tickers each, percentages sum to 100):

{"overview":"2-sentence rationale","conservative":{"label":"Conservative","ornament":"investing wisdom quote","riskScore":"Risk 2/10","upside":"Upside +9%","riskBody":"main risk 1-2 sentences","bullBody":"bull case 1-2 sentences","riskPoints":[["Term","detail"],["Term","detail"],["Term","detail"]],"bullPoints":[["Term","detail"],["Term","detail"],["Term","detail"]],"allocations":[{"sym":"VOO","pct":55,"color":"#C9A84C","cls":"core"}],"totals":{"core":80,"growth":18,"tactical":2}},"balanced":{"label":"Balanced","ornament":"","riskScore":"Risk 4/10","upside":"Upside +18%","riskBody":"","bullBody":"","riskPoints":[],"bullPoints":[],"allocations":[],"totals":{"core":55,"growth":37,"tactical":8}},"aggressive":{"label":"Aggressive","ornament":"","riskScore":"Risk 7/10","upside":"Upside +34%","riskBody":"","bullBody":"","riskPoints":[],"bullPoints":[],"allocations":[],"totals":{"core":25,"growth":54,"tactical":21}}}`;

    const text = await callAnthropic({ prompt, sys, maxTokens: 2400 });

    // Server-side parse attempt. Client still gets raw text as fallback.
    let plan = null;
    try {
      const clean = text.trim()
        .replace(/^```json\s*/, '')
        .replace(/^```\s*/, '')
        .replace(/```\s*$/, '')
        .trim();
      const fi = clean.indexOf('{');
      const li = clean.lastIndexOf('}');
      plan = JSON.parse(fi > -1 && li > fi ? clean.substring(fi, li + 1) : clean);
    } catch { /* plan stays null — client uses text */ }

    res.json({ text, plan, cash: cashNum, style: styleClean });
  } catch (e) { next(e); }
});

// ------------------------------------------------------------------
// POST /api/ai/extract-holdings
// Multimodal path — takes base64 images, returns extracted holdings text.
// Body: { images: [{ mediaType: 'image/png', data: '<base64>' }, ...] }
// ------------------------------------------------------------------
aiRouter.post('/extract-holdings', async (req, res, next) => {
  try {
    const { images } = req.body || {};
    if (!Array.isArray(images) || !images.length) {
      return res.status(400).json({ error: 'images (non-empty array) required' });
    }
    if (images.length > 10) {
      return res.status(400).json({ error: 'max 10 images per request' });
    }

    // Calculate total payload size and validate each image
    let totalPayloadSize = 0;
    for (const img of images) {
      if (!img || !img.data || !img.mediaType) {
        return res.status(400).json({ error: 'each image must have { mediaType, data }' });
      }
      // Strict mediaType validation: only png, jpeg, jpg, webp, gif
      if (!/^image\/(png|jpeg|jpg|webp|gif)$/.test(img.mediaType)) {
        return res.status(400).json({ error: `invalid mediaType: ${img.mediaType}. Allowed: png, jpeg, jpg, webp, gif` });
      }
      totalPayloadSize += img.data.length;
    }

    // Cap total payload size at 30MB
    const maxTotalPayload = 30_000_000;
    if (totalPayloadSize > maxTotalPayload) {
      return res.status(413).json({ error: `total payload exceeds limit (${(totalPayloadSize / 1000000).toFixed(1)}MB). Max 30MB across all images.` });
    }

    const extractPrompt = [
      `You are extracting brokerage positions from ${images.length} screenshot(s). Your job is to find EVERY single position and output them in CSV format. You must not miss any.`,
      '',
      '═══════════════════════════════════════════════════════',
      'STEP 1 — COUNT EVERY TICKER YOU CAN SEE',
      '═══════════════════════════════════════════════════════',
      'Before writing anything else, scan every image and count the number of distinct tickers (stock symbols) you can see. Include ticker rows even if their values are N/A or $0.',
      'Start your response with exactly this line:',
      'COUNT:N',
      'where N is the number you counted. This number TELLS YOU how many data rows you must output in Step 3. If you output fewer, you have failed.',
      '',
      '═══════════════════════════════════════════════════════',
      'STEP 2 — IDENTIFY THE BROKER LAYOUT',
      '═══════════════════════════════════════════════════════',
      '',
      'SCHWAB DESKTOP (most common):',
      'Columns you will see, left to right: Symbol/Name | Quantity | Price | Price Change | Market Value | Day Change | Cost Basis | Gain/Loss',
      'Example row in the image: "CMG  36  $35.83  +$0.75  $1,289.88  +$27.00  $2,044.08  -$754.20"',
      'For this row you MUST output:   CMG,36,56.78,1289.88',
      '  where SHARES=36 (Quantity column),  COST_PER_SHARE=56.78 (Cost Basis $2044.08 ÷ 36 shares),  MARKET_VALUE=1289.88 (Market Value column).',
      '',
      'FIDELITY / VANGUARD DESKTOP — same structure as Schwab.',
      '',
      'ROBINHOOD MOBILE:',
      'Each row shows: SYMBOL, "X.XXXXX shares", and a green-box number that is the CURRENT SHARE PRICE (NOT market value, NOT cost).',
      'Example row: "NVDA  1.11 shares  $200.98"',
      'For this row you MUST output:   NVDA,1.11,0,223.09',
      '  where SHARES=1.11,  COST_PER_SHARE=0 (unknown on mobile),  MARKET_VALUE=223.09 (shares × price = 1.11 × 200.98).',
      '',
      '═══════════════════════════════════════════════════════',
      'STEP 3 — OUTPUT ONE CSV ROW PER TICKER',
      '═══════════════════════════════════════════════════════',
      '',
      'Format:  SYMBOL,SHARES,COST_PER_SHARE,MARKET_VALUE',
      'No headers. No explanations. No markdown. One ticker per line.',
      'The count of data rows you output MUST equal the COUNT:N from Step 1.',
      '',
      'SKIP a position ONLY if:',
      '  - Price shows "N/A" AND market value shows "N/A" AND cost basis shows "N/A" (truly delisted)',
      '  - Share count is 0 or blank',
      '',
      'DO NOT SKIP a position just because:',
      '  - Cost basis column is empty (use 0)',
      '  - You are not sure which column is which (use your best guess — DO NOT omit)',
      '  - The ticker is unfamiliar',
      '',
      'DEDUP: if the same ticker appears in multiple screenshots, output it ONCE (the same account shown in different views is NOT multiple positions).',
      '',
      '═══════════════════════════════════════════════════════',
      'STEP 4 — RECURRING INVESTMENTS (if present)',
      '══════════════════════════════════════════════════════',
      '',
      'If any screenshot shows "Recurring Investments" (e.g. "SCHD weekly buy $15"), add AFTER the main CSV block:',
      'RECURRING:',
      'SYMBOL,MONTHLY_AMOUNT',
      '',
      '═══════════════════════════════════════════════════════',
      'WORKED EXAMPLE (full Schwab screenshot with 14 positions)',
      '═══════════════════════════════════════════════════════',
      'If you saw a Schwab All-Positions page with these 14 rows: CMG, NIO, APRE, DIS, MSFT, CCL, AMD, AAPL, NVDA, LKNCY, NFLX, AMZN, GOOGL, 650194103 (NewAge bankrupt)',
      'Your response would be (and this is literally what you should output, not a description of it):',
      '',
      'COUNT:13',
      'CMG,36,56.78,1289.88',
      'NIO,23,37.05,157.09',
      'APRE,1,166.46,1.00',
      'DIS,13.3114,115.46,1414.87',
      'MSFT,7,394.68,2959.53',
      'CCL,59.3085,21.97,1732.99',
      'AMD,7,135.66,1948.73',
      'AAPL,26.3771,180.60,7127.88',
      'NVDA,48,126.74,9680.64',
      'LKNCY,269,17.20,9089.51',
      'NFLX,190,43.04,18488.90',
      'AMZN,114,130.96,28563.84',
      'GOOGL,115.9288,114.55,39610.55',
      '',
      'Note: NewAge XXXBANKR is omitted because Price/Market Value/Gain-Loss all show N/A (truly delisted).',
      '',
      'Now do the same for the screenshots you are seeing. Start with COUNT:N, then output exactly N data rows.',
    ].join('\n');

    // Anthropic multimodal content array: image blocks then text instruction
    const content = [
      ...images.map(img => ({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType, data: img.data },
      })),
      { type: 'text', text: extractPrompt },
    ];

    // 90-second timeout, bumped to 3000 tokens to accommodate larger position lists
    const text = await callAnthropic({ content, maxTokens: 3000, timeoutMs: 90_000 });

    // Parse the COUNT:N line if present for diagnostic info
    const countMatch = text.match(/^\s*COUNT\s*:\s*(\d+)/im);
    const declaredCount = countMatch ? parseInt(countMatch[1], 10) : null;

    // Validate response: should contain at least one comma-separated line that looks like holdings
    const lines = text.trim().split('\n').filter(l => l.trim());
    const dataLines = lines.filter(l => {
      const trimmed = l.trim();
      if (/^symbol|^recurring|^count\s*:|^count\s*$|^─|^═|^note\s*:|^now\s/i.test(trimmed)) return false;
      if (!trimmed.includes(',')) return false;
      // Must start with a ticker-looking first token
      return /^[A-Z][A-Z0-9.\-]{0,7}\s*,/i.test(trimmed);
    });
    const hasValidHoldings = dataLines.length > 0;

    // If AI said COUNT:14 but only output 6 rows, warn (but still return the rows we got)
    const undercount = declaredCount && dataLines.length < declaredCount * 0.7;

    if (!hasValidHoldings) {
      return res.json({ text, warning: 'no_holdings_found', declaredCount });
    }

    res.json({ text, declaredCount, extractedRows: dataLines.length, undercount });
  } catch (e) { next(e); }
});

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function clampTokens(v, dflt) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(Math.max(n, 100), 4000);
}

function regimeString(ctx) {
  if (!ctx) return 'neutral trend, VIX normal, bias balanced';
  return `${ctx.trend || 'neutral'} trend, VIX ${ctx.vol || 'normal'}, bias ${ctx.bias || 'balanced'}`;
}

function ownershipLine(ticker, holdings) {
  if (!Array.isArray(holdings)) return 'Ownership unknown.';
  const owns = holdings.find(h => h && h.sym === ticker);
  if (!owns) return 'Investor does not currently own this stock.';
  return `Investor currently owns ${owns.shares || 0} shares at $${owns.costPerShare || 0} cost.`;
}
