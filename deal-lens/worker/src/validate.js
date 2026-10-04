// Never trust the extension's payload: check types and cap every field before it reaches the model.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SITES = new Set(["facebook", "craigslist", "offerup", "ebay", "other"]);
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SCREENSHOT_CHARS = 2_000_000;

const text = (value, max) => (typeof value === "string" ? value.slice(0, max) : "");
const isHttpUrl = (value) => typeof value === "string" && value.length <= 2000 && /^https?:\/\//i.test(value);
const fail = (message) => ({ ok: false, message });

export function parseCheckRequest(input) {
  if (!input || typeof input !== "object") return fail("Bad request.");
  if (!UUID.test(String(input.installId || ""))) return fail("Missing install ID.");
  const raw = input.listing;
  if (!raw || typeof raw !== "object") return fail("Missing listing.");

  const listing = {
    url: isHttpUrl(raw.url) ? raw.url : "",
    site: SITES.has(raw.site) ? raw.site : "other",
    title: text(raw.title, 300),
    price: text(raw.price, 60),
    location: text(raw.location, 120),
    description: text(raw.description, 3000),
    details: Array.isArray(raw.details)
      ? raw.details.filter((item) => typeof item === "string").slice(0, 30).map((item) => item.slice(0, 200))
      : [],
    photos: Array.isArray(raw.photos) ? raw.photos.filter(isHttpUrl).slice(0, 4) : [],
    vin: text(raw.vin, 17).toUpperCase(),
    pageText: text(raw.pageText, 8000),
  };
  if (!listing.title && !listing.pageText) return fail("This page doesn't look like a listing.");

  let screenshot = null;
  const shot = input.screenshot;
  if (
    shot &&
    typeof shot === "object" &&
    IMAGE_TYPES.has(shot.mediaType) &&
    typeof shot.data === "string" &&
    shot.data.length <= MAX_SCREENSHOT_CHARS &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(shot.data)
  ) {
    screenshot = { mediaType: shot.mediaType, data: shot.data };
  }
  return { ok: true, installId: input.installId.toLowerCase(), listing, screenshot };
}
