// Loads the real extension into Chromium and runs a full check against the Worker in test mode:
// consent, read the page, screenshot, send, show the verdict.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { launchWithExtension, runPanelCheck } from "../helpers/browser.js";
import { fakeNhtsaFetch, startFixtureServer, startWorkerServer } from "../helpers/servers.js";

let fixtures;
let worker;
let browser;

before(async () => {
  fixtures = await startFixtureServer();
  worker = await startWorkerServer({ env: { MOCK: "1" }, deps: { fetch: fakeNhtsaFetch } });
  browser = await launchWithExtension({ apiBase: worker.url });
});

after(async () => {
  await browser?.close();
  await worker?.close();
  await fixtures?.close();
});

test("a Craigslist bike: the panel shows the sample verdict and the server got the whole listing", async () => {
  const result = await runPanelCheck(browser, `${fixtures.url}/craigslist-bike.html`);
  assert.equal(result.consentShown, true);
  assert.equal(result.error, "");
  assert.equal(result.badge, "Fair price");
  assert.equal(result.item, "Trek Marlin 7 2021 - Size L");
  assert.equal(result.asking, "$650");
  assert.match(result.note, /test mode/);
  assert.equal(result.readoutOpen, false); // with a server, the read-out starts folded

  const { installId, listing, screenshot } = worker.requests.at(-1);
  assert.match(installId, /^[0-9a-f-]{36}$/);
  assert.equal(listing.title, "Trek Marlin 7 2021 - Size L");
  assert.equal(listing.photos.length, 3);
  assert.equal(screenshot?.mediaType, "image/jpeg");
  assert.ok(screenshot.data.length > 1000, "sent a real screenshot");
});

test("a dealer car: the VIN is found, decoded and shown", async () => {
  const result = await runPanelCheck(browser, `${fixtures.url}/dealer-car.html`);
  assert.equal(result.badge, "Fair price");
  assert.equal(worker.requests.at(-1).listing.vin, "1HGCM82633A004352");
  assert.match(result.vin, /1HGCM82633A004352 decodes to 2003 Honda Accord EX/);
  assert.match(result.vin, /Look up open recalls/);
});
