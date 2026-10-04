# Deal Lens

A Chrome extension that tells you whether a used listing is a good deal. Click the icon on any
listing (Facebook Marketplace, Craigslist, OfferUp, eBay, dealer sites) and the side panel shows
a fair price range, a verdict, red flags, and questions to ask the seller.

**Status:** week 1, v0. The extension and server work end to end in test mode (sample verdicts,
no AI). Next is step 3: deploy the server with a real API key and run real checks.

## Folders

- `extension/`: the Chrome extension (Manifest V3, side panel). Plain JavaScript, no build step.
- `worker/`: the server, a Cloudflare Worker that calls Claude. It holds the API key; the
  extension never does.
- `test/`: saved listing pages, unit tests, and browser tests that load the real extension into
  Chromium.
- `tools/`: draws the toolbar icons (`npm run icons`).

## Install it on your Chrome (until it's in the Chrome Web Store)

1. Unzip the `extension` folder somewhere you'll keep it.
2. Go to `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the `extension` folder.
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
