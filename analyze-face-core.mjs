// Real AI vision analysis of a selfie photo, shared by the Netlify function
// (netlify/functions/analyze-face.mjs), the Vercel function
// (api/analyze-face.mjs), and the local dev server (serve.mjs) — one place
// owns the Anthropic call and the trait schema so all three deploy targets
// behave identically.
//
// This is a deliberate return to having a backend (see the "Consolidate to
// a single-file client-only app; drop the AI backend" commit for why it was
// removed the first time: a server-side API key doesn't belong in a project
// meant to be one static file). Re-added on explicit request, this time
// using Claude instead of OpenAI, and — critically — the client-side local
// pipeline in index.html (analyseSelfie) is NOT removed. It still runs
// first for validation (no face / too dark / too blurry / turned too far,
// all free and instant) and stays as the automatic fallback if this
// endpoint isn't configured or the request fails for any reason. The app
// must keep working with zero backend, same as before.
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5';

// Keep these enums in sync with BEARD_PRESETS / GLASSES_PRESETS /
// HAIR_STYLE_PRESETS in index.html — they're duplicated here (browser vs.
// Node, no shared import between them) rather than kept in one file.
const AVATAR_TRAITS_TOOL = {
  name: 'report_avatar_traits',
  description: 'Report the visual traits read from a front-facing photo, for building a matching 3D avatar.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      bodyType: { type: 'string', enum: ['male', 'female'],
        description: 'Apparent body type/presentation.' },
      skinTone: { type: 'string',
        description: 'Hex color (e.g. "#c68a5c") closest to the visible skin tone.' },
      hasFacialHair: { type: 'boolean' },
      beardStyle: { type: 'string',
        enum: ['none', 'thin', 'stubble', 'goatee', 'medium', 'full', 'mustache', 'vandyke', 'muttonchops', 'circle'],
        description: '"none" if hasFacialHair is false. Otherwise the closest real-world shape: ' +
          'thin/stubble/medium/full are coverage AMOUNT (light to heavy, covering the whole jaw); ' +
          'goatee/mustache/vandyke/muttonchops/circle are distinct SHAPES — pick a shape entry only ' +
          'when the hair is confined to that specific area (upper lip only = mustache, chin point + ' +
          'mustache = vandyke, sideburns + mustache with a bare chin = muttonchops, a thin connected ' +
          'ring = circle), otherwise pick the closest coverage-amount entry.' },
      beardColor: { type: 'string',
        description: 'Hex color of the facial hair. Any value is fine if hasFacialHair is false — ignored.' },
      hairStyle: { type: 'string',
        enum: ['default', 'casual', 'casual2', 'adventurer', 'beach', 'suit', 'king', 'punk',
          'aline_bob', 'malt_shop_bob', 'layered_wavy', 'long_wavy', 'long_curly', 'sleek_bun',
          'double_buns', 'cornrows'],
        description: 'The closest REAL option to what\'s visible — these are the app\'s actual hair ' +
          'meshes, not free-form description, so pick the nearest one rather than inventing a style ' +
          'that isn\'t listed. "default" only if hair isn\'t visible at all (hat, out of frame, etc). ' +
          'casual/casual2/adventurer/beach/suit/king are short/medium everyday cuts; punk is a mohawk; ' +
          'aline_bob and malt_shop_bob are chin-length bobs (malt_shop_bob has small pigtail flips at ' +
          'the ends); layered_wavy is shoulder-length waves; long_wavy and long_curly are past-the-' +
          'shoulder straight/curly hair; sleek_bun and double_buns are hair gathered up (one bun vs ' +
          'two); cornrows is tight braids across the whole scalp. When nothing matches well, pick the ' +
          'closest by LENGTH AND VOLUME, not by any other resemblance.' },
      hairColor: { type: 'string',
        description: 'Hex color of the head hair. Any value is fine if hairStyle is "default" — ignored.' },
      hasGlasses: { type: 'boolean' },
      glassesStyle: { type: 'string', enum: ['none', 'round', 'square', 'sunglasses'],
        description: '"none" if hasGlasses is false. "sunglasses" for dark/opaque lenses regardless of ' +
          'frame shape, otherwise "round" or "square" by the lens/frame outline.' },
      jawWidth: { type: 'number',
        description: 'Relative jaw width vs. an average face: 0.8 (narrow) to 1.25 (wide), 1.0 = average.' },
      faceLength: { type: 'number',
        description: 'Relative face length vs. an average face: 0.85 (short/round) to 1.2 (long), 1.0 = average.' },
    },
    required: ['bodyType', 'skinTone', 'hasFacialHair', 'beardStyle', 'beardColor',
      'hairStyle', 'hairColor', 'hasGlasses', 'glassesStyle', 'jawWidth', 'faceLength'],
    additionalProperties: false,
  },
};

const PROMPT = 'Look at this front-facing photo of a person and report the traits needed to build a ' +
  'matching 3D avatar, by calling report_avatar_traits. Read what is actually visible — do not guess ' +
  'wildly at anything out of frame or obscured, and use the field descriptions\' neutral/default values ' +
  'for anything you can\'t actually tell from the photo.';

/**
 * @param {{ imageBase64: string, mediaType?: string }} input
 * @returns {Promise<{ traits: object } | { error: string }>}
 */
export async function analyzeFace({ imageBase64, mediaType } = {}) {
  if (!imageBase64) return { error: 'imageBase64 is required.', clientError: true };
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: 'ANTHROPIC_API_KEY is not configured on the server.' };

  const client = new Anthropic({ apiKey });
  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      tools: [AVATAR_TRAITS_TOOL],
      tool_choice: { type: 'tool', name: 'report_avatar_traits' },
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
          { type: 'text', text: PROMPT },
        ],
      }],
    });
  } catch (err) {
    return { error: `Claude API request failed: ${err?.message || err}` };
  }

  const toolUse = response.content.find(b => b.type === 'tool_use' && b.name === 'report_avatar_traits');
  if (!toolUse) return { error: 'The model did not return structured traits.' };
  return { traits: toolUse.input };
}
