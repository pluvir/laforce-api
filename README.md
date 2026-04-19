# LaForce API

Minimal backend proxy for the LaForce Capital single-file HTML prototype.
Hides Anthropic and Finnhub API keys from the browser. Nothing else yet.

## Run locally

```bash
cd laforce-api
npm install
cp .env.example .env
# edit .env — fill in ANTHROPIC_KEY and FINNHUB_KEY
npm run dev
```

Server starts at `http://localhost:3001`. Confirm with:

```bash
curl http://localhost:3001/api/health
# → {"ok":true,"uptime":0.01}
```

## Routes

| Route                        | Method | Purpose                                |
|------------------------------|--------|----------------------------------------|
| `/api/health`                | GET    | Liveness check                         |
| `/api/ai/raw`                | POST   | Generic Anthropic passthrough          |
| `/api/ai/stock-analysis`     | POST   | Single-stock institutional analysis    |
| `/api/ai/portfolio-study`    | POST   | Full portfolio feasibility study       |
| `/api/ai/deployment`         | POST   | Three-lens deployment plan (JSON)      |
| `/api/market/quote?sym=SPY`  | GET    | Single-symbol quote (30s cache)        |
| `/api/market/batch?syms=...` | GET    | Up to 20 symbols in one round-trip     |

## Configuration

- `ANTHROPIC_KEY` — required for `/api/ai/*`
- `FINNHUB_KEY` — required for `/api/market/*`
- `CORS_ORIGIN` — comma-separated list of allowed frontend origins

## Rate limits

- AI routes: 20 req/min per IP
- Market routes: 120 req/min per IP

## Not included on purpose

No database, no auth, no Redis, no job queue, no streaming.
All of those come in later phases — this exists only to get keys off the browser.
