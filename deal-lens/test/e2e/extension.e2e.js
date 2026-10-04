// Loads the real extension into Chromium and runs a full check against the Worker in test mode:
// consent, read the page, screenshot, send, show the verdict.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { launchWithExtension } from "../helpers/browser.js";
import { fakeNhtsaFetch, startFixtureServer, startWorkerServer } from "../helpers/servers.js";

let fixtures;
let worker;
let browser;

before(async () => {
  fixtures = await startFixtureServer();
  // Port 8787 is where extension/config.js points by default.
  worker = await startWorkerServer({ port: 8787, env: { MOCK: "1" }, deps: { fetch: fakeNhtsaFetch } });
  browser = await launchWithExtension();
});

after(async () => {
  await browser?.close();
  await worker?.close();
  await fixtures?.close();
});

// Opens a fixture, then opens the side panel page in its own window aimed at that tab, and runs a check.
async function checkFixture(name) {
  const page = await browser.context.newPage();
  await page.goto(`${fixtures.url}/${name}.html`, { waitUntil: "load" });
  const tabId = await browser.serviceWorker.evaluate(
    async (url) => (await chrome.tabs.query({ url })).at(0)?.id,
    page.url(),
  );
  assert.ok(tabId, "found the fixture tab");

  const panelOpened = browser.context.waitForEvent("page");
  await browser.serviceWorker.evaluate(
    (url) => chrome.windows.create({ url, type: "popup", width: 420, height: 900 }),
    `chrome-extension://${browser.extensionId}/sidepanel.html?tab=${tabId}`,
  );
  const panel = await panelOpened;
  await panel.waitForLoadState("domcontentloaded");

  if (await panel.locator("#consent").isVisible()) await panel.click("#agree");
  await panel.click("#check");
  await panel.locator(".badge, .error").first().waitFor({ timeout: 20_000 });
  const error = await panel.locator(".error").count();
  const result = {
    error: error ? await panel.textContent(".error") : "",
    badge: error ? "" : await panel.textContent(".badge"),
    item: error ? "" : await panel.textContent(".item"),
    asking: error ? "" : await panel.textContent(".asking"),
    note: error ? "" : await panel.textContent(".note"),
    vin: (await panel.locator(".vin").count()) ? await panel.textContent(".vin") : "",
    request: worker.requests.at(-1),
  };
  await panel.close();
  await page.close();
  return result;
}

test("a Craigslist bike: the panel shows the sample verdict and the server got the whole listing", async () => {
  const result = await checkFixture("craigslist-bike");
  assert.equal(result.error, "");
  assert.equal(result.badge, "Fair price");
  assert.equal(result.item, "Trek Marlin 7 2021 - Size L");
  assert.equal(result.asking, "$650");
  assert.match(result.note, /test mode/);

  const { installId, listing, screenshot } = result.request;
  assert.match(installId, /^[0-9a-f-]{36}$/);
  assert.equal(listing.title, "Trek Marlin 7 2021 - Size L");
  assert.equal(listing.photos.length, 3);
  assert.equal(screenshot?.mediaType, "image/jpeg");
  assert.ok(screenshot.data.length > 1000, "sent a real screenshot");
});

test("a dealer car: the VIN is found, decoded and shown", async () => {
  const result = await checkFixture("dealer-car");
  assert.equal(result.badge, "Fair price");
  assert.equal(result.request.listing.vin, "1HGCM82633A004352");
  assert.match(result.vin, /1HGCM82633A004352 decodes to 2003 Honda Accord EX/);
  assert.match(result.vin, /Look up open recalls/);
});
