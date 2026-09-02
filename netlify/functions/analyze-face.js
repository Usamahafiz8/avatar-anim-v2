// Netlify Functions equivalent of api/analyze-face.js (Vercel). Same shared
// core (../../analyze-face-core.mjs) for validation/Gemini-call/status
// mapping, so all three deploy targets behave identically; only the
// request/response shape differs (Netlify's Request/Response vs Vercel's
// (req, res)). Reached via /api/analyze-face through the redirect in
// netlify.toml.
import { handleAnalyzeFaceRequest } from '../../analyze-face-core.mjs';

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  let parsedBody;
  try { parsedBody = await req.json(); }
  catch { return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 }); }

  const { status, body } = await handleAnalyzeFaceRequest(parsedBody, process.env.GEMINI_API_KEY);
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
};
