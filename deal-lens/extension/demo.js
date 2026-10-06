// Demo mode: a sample verdict built in the browser from the listing that was read, so the extension
// can be tried before the server is live. Nothing leaves the browser.
const roundTen = (value) => Math.round(value / 10) * 10;

function parsePrice(text) {
  const match = String(text || "").replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function demoVerdict(listing) {
  const asking = parsePrice(listing.price);
  return {
    item: listing.title || "Unknown item",
    verdict: asking ? "fair" : "not_enough_info",
    askingPrice: asking,
    fairPriceLow: asking ? roundTen(asking * 0.85) : null,
    fairPriceHigh: asking ? roundTen(asking * 1.1) : null,
    currency: "USD",
    confidence: "low",
    summary: "Placeholder summary. A real check explains the verdict here in a sentence or two.",
    reasons: ["Demo mode sets the range at 15% under to 10% over the asking price."],
    redFlags: [],
    questionsToAsk: [
      "Can you send a photo of the serial number or VIN?",
      "Why are you selling it?",
      "Any damage or repairs I should know about?",
    ],
    vinCheck: listing.vin
      ? {
          vin: listing.vin,
          note: "The VIN gets decoded once the server is live.",
          recallsUrl: `https://www.nhtsa.gov/recalls?vin=${listing.vin}`,
        }
      : null,
    meta: { demo: true },
  };
}
