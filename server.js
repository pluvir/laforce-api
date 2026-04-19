import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { aiRouter } from './routes/ai.js';
import { marketRouter } from './routes/market.js';

const app = express();
const PORT = process.env.PORT || 3001;

// ------------------------------------------------------------------
// Middleware
// ------------------------------------------------------------------
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173')
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    // Allow tools (curl, Postman) where origin is undefined
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) return cb(null, true);
    cb(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: false,
}));
app.use(express.json({ limit: '12mb' })); // 12mb handles screenshot-extract payloads

// ------------------------------------------------------------------
// Per-IP rate limits — the single most important protection here
// ------------------------------------------------------------------
const aiLimit = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });
const marketLimit = rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false });

// ------------------------------------------------------------------
// Routes
// ------------------------------------------------------------------
app.get('/api/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

app.use('/api/ai', aiLimit, aiRouter);
app.use('/api/market', marketLimit, marketRouter);

// 404
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler — return JSON, not HTML
app.use((err, req, res, _next) => {
  console.error('[error]', err.message);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal error' });
});

app.listen(PORT, () => {
  console.log(`LaForce API listening on http://localhost:${PORT}`);
  console.log(`CORS origins: ${allowedOrigins.join(', ')}`);
});
