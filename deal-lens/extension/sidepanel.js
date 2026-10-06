// Deal Lens side panel: reads the listing in the current tab, sends it to the server, shows the verdict.
import { API_BASE } from "./config.js";
import { demoVerdict } from "./demo.js";
import { readListing } from "./reader.js";
import { renderError, renderVerdict } from "./render.js";

const PENDING_MAX_AGE_MS = 15_000;
const SCREENSHOT_MAX_SIDE = 1280;
// No server configured: read the page and show a sample verdict; nothing is sent anywhere.
const DEMO = !API_BASE;

const $ = (id) => document.getElementById(id);
const statusEl = $("status");
const resultEl = $("result");
const consentEl = $("consent");
const accessEl = $("access");
const checkBtn = $("check");

let running = false;
let waiting = null; // a check held back until consent or the access code arrives: { tabId }

class ShownError extends Error {
  constructor(message, code = "") {
    super(message);
    this.code = code;
  }
}

const store = {
  get: async (key) => (await chrome.storage.local.get(key))[key],
  set: (key, value) => chrome.storage.local.set({ [key]: value }),
};

function setStatus(text) {
  statusEl.textContent = text;
  statusEl.hidden = !text;
}

// Shows the consent card, the access-code card, or neither (null).
function show(section) {
  consentEl.hidden = section !== "consent";
  accessEl.hidden = section !== "access";
  checkBtn.disabled = Boolean(section) || running;
  if (section) {
    setStatus("");
    resultEl.hidden = true;
  }
}

async function installId() {
  let id = await store.get("installId");
  if (!id) {
    id = crypto.randomUUID();
    await store.set("installId", id);
  }
  return id;
}

async function findTab(tabId) {
  if (tabId) return chrome.tabs.get(tabId);
  // The automated test opens this page in its own window and names the tab to check.
  const forced = Number(new URLSearchParams(location.search).get("tab"));
  if (forced) return chrome.tabs.get(forced);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function readPage(tabId) {
  try {
    const [injection] = await chrome.scripting.executeScript({ target: { tabId }, func: readListing });
    return injection?.result ?? null;
  } catch {
    throw new ShownError(
      "Deal Lens can't read this page yet. Click the Deal Lens icon in your toolbar while the listing is open.",
    );
  }
}

async function shrinkToJpeg(dataUrl, maxSide) {
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { mediaType: "image/jpeg", data: btoa(binary) };
}

async function screenshot(windowId) {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 90 });
    return await shrinkToJpeg(dataUrl, SCREENSHOT_MAX_SIDE);
  } catch {
    return null; // the screenshot helps the AI, but a check works without it
  }
}

async function askServer(body) {
  const headers = { "content-type": "application/json" };
  const code = await store.get("accessCode");
  if (code) headers["x-deal-lens-code"] = code;
  let res;
  try {
    res = await fetch(`${API_BASE}/v1/check`, { method: "POST", headers, body: JSON.stringify(body) });
  } catch {
    throw new ShownError("Can't reach the Deal Lens server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.error) {
    throw new ShownError(data?.error?.message || "The check didn't go through. Try again in a minute.", data?.error?.code);
  }
  return data;
}

async function runCheck(tabId) {
  if (running) return;
  if (!DEMO && !(await store.get("consentAt"))) {
    waiting = { tabId };
    show("consent");
    return;
  }
  running = true;
  checkBtn.disabled = true;
  resultEl.hidden = true;
  let tab;
  try {
    tab = await findTab(tabId);
    if (!tab) throw new ShownError("Open a listing in this window, then try again.");
    setStatus("Reading the listing…");
    const listing = await readPage(tab.id);
    if (!listing || (!listing.title && !listing.pageText)) {
      throw new ShownError("This page doesn't look like a listing. Open a single listing and try again.");
    }
    let verdict;
    if (DEMO) {
      verdict = demoVerdict(listing);
    } else {
      const shot = await screenshot(tab.windowId);
      setStatus("Checking the price…");
      verdict = await askServer({ installId: await installId(), listing, screenshot: shot });
    }
    setStatus("");
    renderVerdict(resultEl, verdict, listing);
    resultEl.hidden = false;
  } catch (err) {
    setStatus("");
    if (err.code === "access_code") {
      waiting = { tabId: tab?.id };
      show("access");
    } else {
      renderError(resultEl, err instanceof ShownError ? err.message : "Something went wrong. Try again.");
      resultEl.hidden = false;
      if (!(err instanceof ShownError)) console.error(err);
    }
  } finally {
    running = false;
    checkBtn.disabled = !consentEl.hidden || !accessEl.hidden;
  }
}

function resumeWaiting() {
  const next = waiting;
  waiting = null;
  if (next) runCheck(next.tabId);
}

$("agree").addEventListener("click", async () => {
  await store.set("consentAt", new Date().toISOString());
  show(null);
  resumeWaiting();
});

$("access-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = $("access-input").value.trim();
  if (!code) return;
  await store.set("accessCode", code);
  $("access-input").value = "";
  show(null);
  resumeWaiting();
});

async function takePendingCheck() {
  const { pendingCheck } = await chrome.storage.session.get("pendingCheck");
  if (!pendingCheck) return;
  await chrome.storage.session.remove("pendingCheck");
  if (Date.now() - pendingCheck.at <= PENDING_MAX_AGE_MS) runCheck(pendingCheck.tabId);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "check-tab") takePendingCheck();
});
checkBtn.addEventListener("click", () => runCheck());

(async () => {
  if (DEMO) setStatus("Demo mode. Open a listing, then click the Deal Lens icon in your toolbar.");
  else if (!(await store.get("consentAt"))) show("consent");
  await takePendingCheck();
})();
