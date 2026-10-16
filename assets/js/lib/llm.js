// Optional connection to a real language model (Claude), called straight from the browser
// with the visitor's own API key. The key lives in memory only and is never saved.
// Every AI feature in the app has an offline fallback, so nothing depends on this.

export const llm = { apiKey: '', model: 'claude-sonnet-5-5' };
export const llmReady = () => !!llm.apiKey;

/** Send one user message (plus optional system prompt) and return the text reply. */
export async function ask({ system, messages, maxTokens = 800 }) {
  if (!llm.apiKey) throw new Error('Add an Anthropic API key in Settings to use the live model.');
  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': llm.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: llm.model, max_tokens: maxTokens, system, messages }),
    });
  } catch { throw new Error('Couldn’t reach the model. Check your connection and try again.'); }
  if (!res.ok) {
    let msg = res.status === 401 ? 'The API key was rejected. Check it in Settings.' : `The model returned an error (${res.status}).`;
    try { const j = await res.json(); if (j.error?.message) msg += ' ' + j.error.message; } catch { /* keep msg */ }
    throw new Error(msg);
  }
  const j = await res.json();
  return (j.content || []).map(c => c.text || '').join('');
}

/** Pull the first JSON object out of a model reply. */
export function extractJSON(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
