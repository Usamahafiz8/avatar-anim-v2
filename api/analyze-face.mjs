// Vercel Function wrapper — see analyze-face-core.mjs for the actual
// Claude call and trait schema (shared with netlify/functions/analyze-face.mjs
// and serve.mjs's local dev route so all three deploy targets behave the same).
import { analyzeFace } from '../analyze-face-core.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const result = await analyzeFace(body);
  if (result.error) {
    res.status(result.clientError ? 400 : 502).json(result);
    return;
  }
  res.status(200).json(result.traits);
}
