# Deal Lens

A Chrome extension that tells you whether a used listing is a good deal. Click the icon on any
listing (Facebook Marketplace, Craigslist, OfferUp, eBay, dealer sites) and the side panel shows
a fair price range, a verdict, red flags, and questions to ask the seller.

**Status:** week 1, v0. The extension and server work end to end in test mode (sample verdicts,
no AI). Next is step 3: deploy the server with a real API key and run real checks.

**Demo mode:** with `API_BASE` empty in `extension/config.js` (the default), the extension needs no
server. It reads the listing and shows a placeholder verdict plus "What Deal Lens read from this
page", so the page reader can be tried on real sites. Nothing leaves the browser.

## Folders

- `extension/`: the Chrome extension (Manifest V3, side panel). Plain JavaScript, no build step.
- `worker/`: the server, a Cloudflare Worker that calls Claude. It holds the API key; the
  extension never does.
- `test/`: saved listing pages, unit tests, and browser tests that load the real extension into
  Chromium.
- `tools/`: draws the toolbar icons (`npm run icons`).

## Install it on your Chrome (until it's in the Chrome Web Store)

1. Unzip the extension somewhere you'll keep it (`npm run zip` builds `dist/deal-lens-extension.zip`).
2. Go to `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the folder that has `manifest.json` in it.
4. Pin Deal Lens from the puzzle-piece menu. Open a listing and click the icon, or press
   Alt+Shift+D.

To update, replace the folder's contents and click the reload arrow on the Deal Lens card.

## Run the tests

```sh
npm install
npm test
```

## Server settings

| Name | Kind | What it does |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | secret | Claude API key. Without it the server runs in test mode. |
| `ACCESS_CODE` | secret | While testing privately, every check must send this code. |
| `MODEL` | var | Model to use; `claude-opus-5-5` by default. |
| `DAILY_LIMIT_PER_INSTALL` | var | Checks per install per UTC day. Needs the D1 database bound as `DB`. |
| `MOCK` | var | `"1"` forces test mode. |

Secrets are set with `wrangler secret put <NAME>` or in the Cloudflare dashboard, never in this repo.

## Step 3: go live (next session)

Needs these in the cloud environment's settings: `DEAL_LENS_ANTHROPIC_KEY`, `CLOUDFLARE_API_TOKEN`
and `CLOUDFLARE_ACCOUNT_ID`, plus network access to `api.cloudflare.com` and `workers.dev`.
This container can reach `api.anthropic.com` already; Node's fetch needs `NODE_USE_ENV_PROXY=1`
to use the proxy.

1. From `worker/`, run `npx wrangler d1 create deal-lens`. Paste the id into `wrangler.toml`,
   uncomment the D1 block, then run `npx wrangler d1 migrations apply deal-lens --remote`.
2. Set the secrets: pipe `DEAL_LENS_ANTHROPIC_KEY` into `npx wrangler secret put ANTHROPIC_API_KEY`,
   then set `ACCESS_CODE` the same way.
3. Run `npx wrangler deploy` and point `extension/config.js` at the workers.dev URL.
4. Run 5 real checks (the fixture listings work as inputs) and report the cost per check from
   `meta.estCostUsd`. That settles Opus 5.5 vs Sonnet 5.5 (the `MODEL` var).
5. Zip `extension/` and send it to Simon along with the access code.
