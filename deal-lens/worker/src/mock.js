// Test mode: a fixed-shape verdict so the whole flow can be tried without an API key.
export function parsePrice(text) {
  const match = String(text || "").replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export function mockVerdict(listing) {
  const asking = parsePrice(listing.price);
  const roundTen = (value) => Math.round(value / 10) * 10;
  return {
    item: listing.title || "Unknown item",
    verdict: asking ? "fair" : "not_enough_info",
    askingPrice: asking,
    fairPriceLow: asking ? roundTen(asking * 0.85) : null,
    fairPriceHigh: asking ? roundTen(asking * 1.1) : null,
    currency: "USD",
    confidence: "low",
    summary: "Sample summary. A real check explains the verdict here in a sentence or two.",
    reasons: ["Test mode sets the range at 15% under to 10% over the asking price."],
    redFlags: [],
    questionsToAsk: [
      "Can you send a photo of the serial number or VIN?",
      "Why are you selling it?",
      "Any damage or repairs I should know about?",
    ],
  };
}
