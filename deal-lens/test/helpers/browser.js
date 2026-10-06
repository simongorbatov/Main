// Launches Chromium with a test copy of the extension loaded, and drives the side panel.
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const extensionDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../extension");

// apiBase: the server the test copy talks to. Leave it out to test demo mode, the shipped default.
export async function launchWithExtension({ apiBase } = {}) {
  const work = await mkdtemp(path.join(os.tmpdir(), "deal-lens-"));
  const testExtension = path.join(work, "extension");
  await cp(extensionDir, testExtension, { recursive: true });

  // Tests can't click the toolbar icon, which is what grants activeTab, so the test copy
  // gets host permissions instead. The real extension never asks for them.
  const manifestPath = path.join(testExtension, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.host_permissions = ["<all_urls>"];
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  if (apiBase) {
    await writeFile(path.join(testExtension, "config.js"), `export const API_BASE = ${JSON.stringify(apiBase)};\n`);
  }

  // The full Chromium build (channel "chromium") runs extensions in headless mode.
  const context = await chromium.launchPersistentContext(path.join(work, "profile"), {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${testExtension}`, `--load-extension=${testExtension}`],
  });
  const serviceWorker = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker"));
  return {
    context,
    serviceWorker,
    extensionId: new URL(serviceWorker.url()).host,
    close: async () => {
      await context.close();
      await rm(work, { recursive: true, force: true });
    },
  };
}

// Opens a page, opens the side panel in its own window aimed at that tab, runs a check,
// and returns what the panel shows.
export async function runPanelCheck(browser, pageUrl) {
  const page = await browser.context.newPage();
  await page.goto(pageUrl, { waitUntil: "load" });
  const tabId = await browser.serviceWorker.evaluate(async (url) => (await chrome.tabs.query({ url })).at(0)?.id, page.url());
  if (!tabId) throw new Error(`No tab found for ${pageUrl}`);

  const panelOpened = browser.context.waitForEvent("page");
  await browser.serviceWorker.evaluate(
    (url) => chrome.windows.create({ url, type: "popup", width: 420, height: 900 }),
    `chrome-extension://${browser.extensionId}/sidepanel.html?tab=${tabId}`,
  );
  const panel = await panelOpened;
  await panel.waitForLoadState("load");

  const consentShown = await panel.locator("#consent").isVisible();
  if (consentShown) await panel.click("#agree");
  await panel.click("#check");
  await panel.locator(".badge, .error").first().waitFor({ timeout: 20_000 });

  const text = async (selector) => ((await panel.locator(selector).count()) ? (await panel.textContent(selector)).trim() : "");
  await panel.waitForFunction(() => [...document.querySelectorAll(".thumbs img")].every((img) => img.complete));
  const result = {
    consentShown,
    error: await text(".error"),
    badge: await text(".badge"),
    item: await text(".item"),
    asking: await text(".asking"),
    note: await text(".note"),
    vin: await text(".vin"),
    readout: await text(".readout"),
    readoutOpen: (await panel.locator(".readout").count()) ? await panel.locator(".readout").evaluate((node) => node.open) : false,
    photosShown: await panel.locator(".thumbs img").evaluateAll((imgs) => imgs.filter((img) => img.naturalWidth > 0).length),
  };
  await panel.close();
  await page.close();
  return result;
}
