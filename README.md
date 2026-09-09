# avatar-anim-v2

`npm run build` fetches the 3D assets (see `fetch-assets.mjs`), `npm run serve` runs a local dev server.

## Optional: AI-enhanced selfie analysis

The Customize panel's photo flow works entirely offline by default (local
MediaPipe/canvas heuristics — see `analyseSelfie()` in `index.html`). Setting
`ANTHROPIC_API_KEY` turns on a real vision-model pass (Claude, via
`analyze-face-core.mjs`) that reads skin tone, glasses, beard, hair, and face
shape directly from the photo instead of pixel heuristics — noticeably more
accurate, at a small per-photo API cost.

- **Netlify**: set `ANTHROPIC_API_KEY` in the site's environment variables
  (Site settings → Environment variables). The function at
  `netlify/functions/analyze-face.mjs` picks it up automatically.
- **Vercel**: same, under Project Settings → Environment Variables
  (`api/analyze-face.mjs`).
- **Local dev**: add `ANTHROPIC_API_KEY=...` to `.env`, then `npm run serve`
  (the `serve` script passes `--env-file=.env`).

Without the key set, the app works exactly as before — the endpoint returns
an error and the client falls back to the local heuristics automatically, no
user-visible difference beyond the "(AI-enhanced)" tag in the upload message.
