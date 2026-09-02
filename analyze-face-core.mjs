// Shared Gemini vision call, used by api/analyze-face.js (Vercel), the
// Netlify functions wrapper, and serve.mjs's local-dev route — one place
// for the prompt/schema/parsing so the three entry points can't drift.
// Node 20 has native fetch, so this needs no HTTP client dependency.

const MODEL = 'gemini-2.0-flash';
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// Keys mirror this repo's own preset vocab (see HAIR_STYLE_PRESETS,
// BEARD_PRESETS etc. in demo.html) so the client can apply a result directly
// without a translation layer, and can fall back cleanly if a field is
// missing/invalid.
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    bodyType:    { type: 'STRING', enum: ['male', 'female'] },
    skinToneHex: { type: 'STRING', description: 'Hex color, e.g. #c68a5c' },
    eyeColorHex: { type: 'STRING', description: 'Hex color of the iris' },
    hasGlasses:  { type: 'BOOLEAN' },
    hairStyle:   { type: 'STRING', enum: ['default', 'buzz', 'crop', 'swept'] },
    hairColorHex:  { type: 'STRING', description: 'Hex color of the hair' },
    beardStyle:    { type: 'STRING', enum: ['none', 'stubble', 'goatee', 'full'] },
    beardColorHex: { type: 'STRING', description: 'Hex color of the facial hair, if any' },
  },
  required: ['bodyType', 'skinToneHex', 'eyeColorHex', 'hasGlasses', 'hairStyle', 'beardStyle'],
};

const PROMPT = `Analyse the single clearest human face in this photo for a 3D avatar generator. Reply with the structured fields only, no commentary.

- bodyType: "male" or "female", your best visual read of presentation.
- skinToneHex: the person's skin tone as a hex colour.
- eyeColorHex: the iris colour as a hex colour (best estimate if not clearly visible).
- hasGlasses: true if wearing glasses (any frame, including sunglasses).
- hairStyle: classify the head hair into exactly one of: "buzz" (very short, near scalp), "crop" (short, neat, not buzzed), "swept" (longer, styled back or to a side, covers more scalp), "default" (medium-length / uncertain / not clearly one of the above).
- hairColorHex: the head hair colour as a hex colour. Omit if bald/no visible hair.
- beardStyle: classify facial hair into exactly one of: "none", "stubble" (light shadow, chin/upper-lip only, short), "goatee" (chin + moustache, cheeks bare), "full" (covers jaw and cheeks). Always "none" for a visibly female presentation or a clean-shaven face.
- beardColorHex: the facial hair colour as a hex colour. Omit if beardStyle is "none".`;

export class GeminiConfigError extends Error {}
export class GeminiRequestError extends Error {}

/**
 * @param {string} base64Image - raw base64 (no data: prefix)
 * @param {string} mimeType - e.g. "image/jpeg"
 * @param {string} apiKey
 * @returns {Promise<object>} parsed trait fields (hex strings, enum strings, booleans)
 */
export async function analyzeFaceWithGemini(base64Image, mimeType, apiKey) {
  if (!apiKey) throw new GeminiConfigError('GEMINI_API_KEY not configured');

  const body = {
    contents: [{
      parts: [
        { text: PROMPT },
        { inlineData: { mimeType, data: base64Image } },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  };

  const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new GeminiRequestError(`Gemini API error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new GeminiRequestError('Gemini returned no content');

  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new GeminiRequestError('Gemini returned unparseable JSON'); }

  return parsed;
}

// 5MB cap: generous for a selfie, small enough to keep the function fast and
// stay well under typical serverless request-body limits. Checked against
// the base64 STRING length (not decoded byte size) — base64 runs ~4/3 the
// size of the raw bytes it encodes, hence the 1.4x fudge factor below.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_BASE64_CHARS = MAX_IMAGE_BYTES * 1.4;

// One request-handling path for all three entry points (api/analyze-face.js
// on Vercel, netlify/functions/analyze-face.js, serve.mjs's local-dev
// route) — each has a different request/response shape to adapt to, but the
// validation, the Gemini call, and the status-code mapping used to be
// copy-pasted into each one and had already drifted (one checked the raw
// body length against a different threshold than the other two). This is
// the single place that logic lives now; a caller passes in the already-
// parsed { image, mimeType } body and the resolved API key, and gets back a
// plain { status, body } pair to translate into its own response type.
export async function handleAnalyzeFaceRequest(parsedBody, apiKey) {
  const { image, mimeType } = parsedBody || {};
  if (!image || typeof image !== 'string') {
    return { status: 400, body: { error: 'Missing image' } };
  }
  if (image.length > MAX_BASE64_CHARS) {
    return { status: 413, body: { error: 'Image too large' } };
  }

  try {
    const traits = await analyzeFaceWithGemini(image, mimeType || 'image/jpeg', apiKey);
    return { status: 200, body: traits };
  } catch (err) {
    if (err instanceof GeminiConfigError) {
      return { status: 503, body: { error: 'AI detection not configured' } };
    }
    console.error('[analyze-face]', err);
    return { status: 502, body: { error: 'AI detection failed' } };
  }
}
