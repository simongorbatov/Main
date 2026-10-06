// The extension as shipped (no server set): demo mode reads the page and shows a sample verdict,
// with no consent screen and nothing sent anywhere.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { launchWithExtension, runPanelCheck } from "../helpers/browser.js";
import { startFixtureServer } from "../helpers/servers.js";

let fixtures;
let browser;

before(async () => {
  fixtures = await startFixtureServer();
  browser = await launchWithExtension();
});

after(async () => {
  await browser?.close();
  await fixtures?.close();
});

test("demo mode: no consent, a labeled sample verdict, and an open read-out with the photos", async () => {
  const result = await runPanelCheck(browser, `${fixtures.url}/marketplace-item.html`);
  assert.equal(result.consentShown, false);
  assert.equal(result.error, "");
  assert.equal(result.badge, "Fair price");
  assert.equal(result.item, "Bosch Performance Line CX motor 2022");
  assert.equal(result.asking, "$480");
  assert.match(result.note, /Demo mode\. Nothing left your browser/);
  assert.equal(result.readoutOpen, true);
  assert.match(result.readout, /Price\s*\$480/);
  assert.match(result.readout, /Location\s*Tacoma, WA/);
  assert.match(result.readout, /3 photos found/);
  assert.equal(result.photosShown, 3);
});

test("demo mode: a VIN on the page is shown, to be decoded once the server is live", async () => {
  const result = await runPanelCheck(browser, `${fixtures.url}/dealer-car.html`);
  assert.match(result.vin, /Found VIN 1HGCM82633A004352\./);
  assert.match(result.vin, /decoded once the server is live/);
  assert.match(result.vin, /Look up open recalls/);
});
