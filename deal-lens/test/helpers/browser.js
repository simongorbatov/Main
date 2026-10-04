// Launches Chromium with a test copy of the extension loaded.
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const extensionDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../extension");

export async function launchWithExtension() {
  const work = await mkdtemp(path.join(os.tmpdir(), "deal-lens-"));
  const testExtension = path.join(work, "extension");
  await cp(extensionDir, testExtension, { recursive: true });

  // Tests can't click the toolbar icon, which is what grants activeTab, so the test copy
  // gets host permissions instead. The real extension never asks for them.
  const manifestPath = path.join(testExtension, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.host_permissions = ["<all_urls>"];
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

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
