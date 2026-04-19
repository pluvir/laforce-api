const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';
const TIMEOUT_MS = 60_000;

/**
 * Call Anthropic's Messages API with the server-held key.
 * Throws an Error with .status for bubbled HTTP semantics.
 */
export async function callAnthropic({ prompt, sys, maxTokens = 1200 }) {
  const key = process.env.ANTHROPIC_KEY;
  if (!key) {
    const err = new Error('ANTHROPIC_KEY missing on server');
    err.status = 500;
    throw err;
  }

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  try {
    const r = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: maxTokens,
        system: sys,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: ctrl.signal,
    });

    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      const upstreamMsg = (body.error && body.error.message) || r.statusText;
      const err = new Error(friendlyError(r.status, upstreamMsg));
      // Map provider codes to something the client can handle cleanly
      err.status = r.status === 429 ? 429 : r.status >= 500 ? 502 : 502;
      throw err;
    }

    const j = await r.json();
    const text = j?.content?.[0]?.text;
    if (!text) {
      const err = new Error('Empty response from AI');
      err.status = 502;
      throw err;
    }
    return text;
  } catch (e) {
    if (e.name === 'AbortError') {
      const err = new Error('AI request timed out');
      err.status = 504;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(to);
  }
}

function friendlyError(status, msg) {
  if (status === 401) return 'AI service authentication failed';
  if (status === 403) return 'AI service permission denied';
  if (status === 429) return 'AI rate limit reached — try again in a minute';
  if (status >= 500) return 'AI service temporarily unavailable';
  return msg || `AI service error ${status}`;
}
