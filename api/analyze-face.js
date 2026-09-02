// Vercel serverless function (Node runtime, auto-routed from /api/analyze-face
// by file location). Proxies one Gemini vision call per uploaded photo so the
// GEMINI_API_KEY never reaches client JS. See analyze-face-core.mjs for the
// shared prompt/schema/parsing/validation — also used by the Netlify
// function and by serve.mjs's local-dev route, so all three deploy targets
// behave identically (this file only adapts Vercel's (req, res) shape).
import { handleAnalyzeFaceRequest } from '../analyze-face-core.mjs';

export const config = { api: { bodyParser: { sizeLimit: '6mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { status, body } = await handleAnalyzeFaceRequest(req.body, process.env.GEMINI_API_KEY);
  res.status(status).json(body);
}
