// The shape every verdict follows. Structured output makes the model stick to it.
export const VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "item",
    "verdict",
    "askingPrice",
    "fairPriceLow",
    "fairPriceHigh",
    "currency",
    "confidence",
    "summary",
    "reasons",
    "redFlags",
    "questionsToAsk",
  ],
  properties: {
    item: { type: "string", description: "What the item is, as precisely as the listing allows." },
    verdict: { type: "string", enum: ["good_deal", "fair", "overpriced", "not_enough_info"] },
    askingPrice: {
      anyOf: [{ type: "number" }, { type: "null" }],
      description: "The listed price as a plain number, or null if no price is shown.",
    },
    fairPriceLow: { anyOf: [{ type: "number" }, { type: "null" }] },
    fairPriceHigh: { anyOf: [{ type: "number" }, { type: "null" }] },
    currency: { type: "string", description: "ISO 4217 code, for example USD." },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    summary: { type: "string" },
    reasons: { type: "array", items: { type: "string" } },
    redFlags: { type: "array", items: { type: "string" } },
    questionsToAsk: { type: "array", items: { type: "string" } },
  },
};
