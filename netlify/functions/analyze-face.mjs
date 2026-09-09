// Netlify Function wrapper — see analyze-face-core.mjs for the actual
// Claude call and trait schema (shared with api/analyze-face.mjs and
// serve.mjs's local dev route so all three deploy targets behave the same).
import { analyzeFace } from '../../analyze-face-core.mjs';

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }
  const result = await analyzeFace(body);
  if (result.error) {
    // 502: this endpoint reached the outside world (or tried to) and that
    // leg failed — a config problem (no key) or an upstream API error.
    // clientError (bad/missing input) is the caller's fault instead — 400.
    return { statusCode: result.clientError ? 400 : 502, body: JSON.stringify(result) };
  }
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(result.traits),
  };
};
