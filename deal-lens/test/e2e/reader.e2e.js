// Runs the page reader against each fixture page in a real browser.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { chromium } from "playwright";
import { readListing } from "../../extension/reader.js";
import { startFixtureServer } from "../helpers/servers.js";

let fixtures;
let browser;

before(async () => {
  fixtures = await startFixtureServer();
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  await fixtures?.close();
});

async function read(name) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${fixtures.url}/${name}.html`, { waitUntil: "load" });
  const listing = await page.evaluate(readListing);
  await page.close();
  return listing;
}

const paths = (urls) => urls.map((url) => new URL(url).pathname);

test("Craigslist: title, price, area, details, description without the QR text, all photos", async () => {
  const listing = await read("craigslist-bike");
  assert.equal(listing.site, "craigslist");
  assert.equal(listing.title, "Trek Marlin 7 2021 - Size L");
  assert.equal(listing.price, "$650");
  assert.equal(listing.location, "Ballard");
  assert.match(listing.description, /^Selling my 2021 Trek Marlin 7/);
  assert.doesNotMatch(listing.description, /QR Code/);
  assert.ok(listing.details.includes("condition: excellent"));
  assert.deepEqual(paths(listing.photos), [
    "/img/cl-bike-1_600x450.png",
    "/img/cl-bike-2_600x450.png",
    "/img/cl-bike-3_600x450.png",
  ]);
  assert.equal(listing.vin, "");
});

test("Marketplace: reads by structure, skips the avatar and seller photo", async () => {
  const listing = await read("marketplace-item");
  assert.equal(listing.site, "facebook");
  assert.equal(listing.title, "Bosch Performance Line CX motor 2022");
  assert.equal(listing.price, "$480");
  assert.equal(listing.location, "Tacoma, WA");
  assert.match(listing.description, /^Pulled from a 2022 Trek Allant\+/);
  assert.deepEqual(listing.details, ["Condition Used - Like new"]);
  assert.deepEqual(paths(listing.photos), ["/img/fb-motor-1.png", "/img/fb-motor-2.png", "/img/fb-motor-3.png"]);
  assert.doesNotMatch(listing.pageText, /Your profile/); // the page header is outside the listing
});

test("eBay: item specifics, and mid-size copies of the carousel photos", async () => {
  const listing = await read("ebay-part");
  assert.equal(listing.site, "ebay");
  assert.equal(listing.title, "Shimano XT M8100 12-Speed Rear Derailleur RD-M8100-SGS");
  assert.equal(listing.price, "US $89.99");
  assert.deepEqual(listing.details, ["Condition: Used", "Brand: Shimano", "Speeds: 12"]);
  assert.deepEqual(paths(listing.photos), ["/img/ebay-rd/s-l960.png", "/img/ebay-rd-2/s-l960.png"]);
});

test("Any other site: schema.org data and a VIN with a valid check digit", async () => {
  const listing = await read("dealer-car");
  assert.equal(listing.site, "other");
  assert.equal(listing.title, "2003 Honda Accord EX Coupe");
  assert.equal(listing.price, "USD 4995");
  assert.equal(listing.vin, "1HGCM82633A004352");
  assert.ok(listing.details.includes("Mileage: 148000 SMI"));
  assert.ok(listing.details.includes("Brand: Honda"));
  assert.deepEqual(paths(listing.photos), ["/img/car-1.png", "/img/car-2.png"]);
});
