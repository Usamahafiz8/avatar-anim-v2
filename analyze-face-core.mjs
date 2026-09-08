// Shared OpenAI vision call, used by api/analyze-face.js (Vercel), the
// Netlify functions wrapper, and serve.mjs's local-dev route — one place
// for the prompt/schema/parsing so the three entry points can't drift.
// Node 20 has native fetch, so this needs no HTTP client dependency.

// Switched from Gemini to OpenAI on request — the actual reported bug
// ("take a selfie is not working") turned out to be simpler than a model
// issue this time: no GEMINI_API_KEY was configured anywhere locally at
// all (no .env file existed), so every call threw GeminiConfigError before
// ever reaching Google. That's a separate problem from the EARLIER
// gemini-2.0-flash retirement (see this repo's own git history) — this
// migration is about which provider to call, not fixing Gemini itself.
// gpt-4o-mini is the same model already used for the equivalent selfie
// trait-detection call in the sibling `character-customizer` project (same
// API key, provided by the founder specifically "for the detection").
//
// One real difference from the Gemini version: OpenAI's `response_format:
// json_object` mode guarantees valid JSON syntax, but NOT that the fields
// match a schema (Gemini's `responseSchema` enforced the enum values
// directly) — so wrong/missing/malformed fields are now a real
// possibility, not just a hypothetical. Every field is validated against
// its real enum/hex-format below before this ever reaches the client, the
// same "model output is untrusted input" rule already applied to
// character-customizer's own analyze-photo endpoint.
const MODEL = 'gpt-4o-mini';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

// Keys mirror this repo's own preset vocab (see HAIR_STYLE_PRESETS,
// BEARD_PRESETS etc. in demo.html) so the client can apply a result directly
// without a translation layer, and can fall back cleanly if a field is
// missing/invalid.
const HAIR_STYLES = ['default', 'buzz', 'crop', 'swept'];
const BEARD_STYLES = ['none', 'thin', 'stubble', 'goatee', 'medium', 'full'];
const JAW_WIDTHS = ['narrow', 'average', 'wide'];
const FACE_LENGTHS = ['short', 'average', 'long'];
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const PROMPT = `Analyse the single clearest human face in this photo for a 3D avatar generator.

CRITICAL: IGNORE BACKGROUND COLOURS COMPLETELY. Only extract colours from the person's actual face/hair/eyes/lips — a background that happens to be a similar colour to skin or hair is not the person.

Respond with ONLY valid JSON, no markdown, no explanation, in exactly this shape:
{
  "bodyType": "male" or "female" — your best visual read of presentation,
  "skinToneHex": "#rrggbb" — the person's actual visible skin tone (face only, not background),
  "eyeColorHex": "#rrggbb" — the iris colour (best estimate if not clearly visible),
  "hasGlasses": true or false — wearing glasses, any frame including sunglasses,
  "hairStyle": one of "buzz" (very short, near scalp), "crop" (short, neat, not buzzed), "swept" (longer, styled back or to a side, covers more scalp), "default" (medium-length / uncertain / not clearly one of the above),
  "hairColorHex": "#rrggbb" — head hair colour, omit/null if bald or no visible hair,
  "beardStyle": one of "none" (clean-shaven — always this for a visibly female presentation), "thin" (barely-there shadow, skin clearly visible through it, no moustache), "stubble" (light shadow, chin/upper-lip only, short but slightly denser than "thin"), "goatee" (chin + moustache only, cheeks bare), "medium" (covers jaw and cheeks, neat/moderate density, skin still visible through it), "full" (covers jaw and cheeks, thick/dense, near-solid coverage, little to no skin visible through it),
  "beardColorHex": "#rrggbb" — facial hair colour, omit/null if beardStyle is "none",
  "lipColorHex": "#rrggbb" — the lips' natural colour,
  "jawWidth": one of "narrow", "average", "wide" — jawline/cheekbone width relative to the rest of the face,
  "faceLength": one of "short", "average", "long" — overall face length (forehead hairline to chin) relative to face width
}`;

export class OpenAIConfigError extends Error {}
export class OpenAIRequestError extends Error {}

// Model output is untrusted input, same reasoning as character-customizer's
// own sanitizer — never hand a color/enum straight from the API response to
// client code that assumes it's already valid. Anything invalid/missing
// falls back to a safe default rather than rejecting the whole result; a
// bad `jawWidth` shouldn't throw away a good `skinToneHex` in the same reply.
function sanitizeTraits(parsed) {
  const enumOr = (val, allowed, fallback) => (allowed.includes(val) ? val : fallback);
  const hexOrNull = (val) => (typeof val === 'string' && HEX_RE.test(val) ? val : null);
  const hexOr = (val, fallback) => hexOrNull(val) || fallback;

  const beardStyle = enumOr(parsed?.beardStyle, BEARD_STYLES, 'none');
  return {
    bodyType: parsed?.bodyType === 'female' ? 'female' : 'male',
    skinToneHex: hexOr(parsed?.skinToneHex, '#c68a5c'),
    eyeColorHex: hexOr(parsed?.eyeColorHex, '#4a3728'),
    hasGlasses: parsed?.hasGlasses === true,
    hairStyle: enumOr(parsed?.hairStyle, HAIR_STYLES, 'default'),
    hairColorHex: hexOrNull(parsed?.hairColorHex),
    beardStyle,
    beardColorHex: beardStyle === 'none' ? null : hexOrNull(parsed?.beardColorHex),
    lipColorHex: hexOrNull(parsed?.lipColorHex),
    jawWidth: enumOr(parsed?.jawWidth, JAW_WIDTHS, 'average'),
    faceLength: enumOr(parsed?.faceLength, FACE_LENGTHS, 'average'),
  };
}

/**
 * @param {string} base64Image - raw base64 (no data: prefix)
 * @param {string} mimeType - e.g. "image/jpeg"
 * @param {string} apiKey
 * @returns {Promise<object>} sanitized trait fields (hex strings, enum strings, booleans)
 */
export async function analyzeFaceWithOpenAI(base64Image, mimeType, apiKey) {
  if (!apiKey) throw new OpenAIConfigError('OPENAI_API_KEY not configured');

  const body = {
    model: MODEL,
    response_format: { type: 'json_object' },
    temperature: 0.2,
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: PROMPT },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
      ],
    }],
  };

  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new OpenAIRequestError(`OpenAI API error ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new OpenAIRequestError('OpenAI returned no content');

  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new OpenAIRequestError('OpenAI returned unparseable JSON'); }

  return sanitizeTraits(parsed);
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
// validation, the OpenAI call, and the status-code mapping used to be
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
    const traits = await analyzeFaceWithOpenAI(image, mimeType || 'image/jpeg', apiKey);
    return { status: 200, body: traits };
  } catch (err) {
    if (err instanceof OpenAIConfigError) {
      return { status: 503, body: { error: 'AI detection not configured' } };
    }
    console.error('[analyze-face]', err);
    return { status: 502, body: { error: 'AI detection failed' } };
  }
}
