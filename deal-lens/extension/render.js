// Builds the result card. Everything shown comes from the server or the page, so it is set
// as text, never as HTML.
const VERDICTS = {
  good_deal: ["Good deal", "good"],
  fair: ["Fair price", "fair"],
  overpriced: ["Overpriced", "bad"],
  not_enough_info: ["Not enough info", "unknown"],
};

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "className") node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) node.append(child);
  return node;
}

function money(value, currency) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Unknown";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `$${Math.round(value).toLocaleString("en-US")}`;
  }
}

function list(title, items, emptyText) {
  const section = el("section", {}, el("h3", {}, title));
  if (items?.length) section.append(el("ul", {}, ...items.map((item) => el("li", {}, String(item)))));
  else if (emptyText) section.append(el("p", { className: "muted" }, emptyText));
  return section;
}

function vinSection(vin) {
  const decoded = [vin.year, vin.make, vin.model, vin.trim].filter(Boolean).join(" ");
  const section = el(
    "section",
    { className: "vin" },
    el("h3", {}, "VIN check"),
    el("p", {}, decoded ? `${vin.vin} decodes to ${decoded}.` : `${vin.vin} couldn't be decoded.`),
  );
  if (vin.note) section.append(el("p", { className: "muted" }, vin.note));
  if (vin.recallsUrl) {
    section.append(el("a", { href: vin.recallsUrl, target: "_blank", rel: "noopener" }, "Look up open recalls (NHTSA)"));
  }
  return section;
}

export function renderVerdict(root, verdict, listing) {
  const [label, tone] = VERDICTS[verdict.verdict] || VERDICTS.not_enough_info;
  const card = el("div", { className: "card" });
  if (verdict.meta?.mock) {
    card.append(el("p", { className: "note" }, "Sample result. The server is in test mode, so no AI looked at this listing."));
  }
  card.append(el("p", { className: `badge ${tone}` }, label));
  card.append(el("h2", { className: "item" }, verdict.item || listing.title || "This listing"));

  const range =
    typeof verdict.fairPriceLow === "number" && typeof verdict.fairPriceHigh === "number"
      ? `${money(verdict.fairPriceLow, verdict.currency)}–${money(verdict.fairPriceHigh, verdict.currency)}`
      : "Unknown";
  card.append(
    el(
      "div",
      { className: "prices" },
      el("div", {}, el("div", { className: "price-label" }, "Asking"), el("div", { className: "price-value asking" }, money(verdict.askingPrice, verdict.currency))),
      el("div", {}, el("div", { className: "price-label" }, "Fair range"), el("div", { className: "price-value range" }, range)),
    ),
  );
  card.append(el("p", { className: "confidence" }, `Confidence: ${verdict.confidence || "low"}`));
  if (verdict.summary) card.append(el("p", { className: "summary" }, verdict.summary));
  if (verdict.reasons?.length) card.append(list("Why", verdict.reasons));
  card.append(list("Red flags", verdict.redFlags, "No red flags spotted."));

  if (verdict.questionsToAsk?.length) {
    const section = list("Ask the seller", verdict.questionsToAsk);
    const copy = el("button", { type: "button", className: "secondary" }, "Copy questions");
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(verdict.questionsToAsk.join("\n"));
        copy.textContent = "Copied";
      } catch {
        copy.textContent = "Couldn't copy";
      }
    });
    section.append(copy);
    card.append(section);
  }
  if (verdict.vinCheck) card.append(vinSection(verdict.vinCheck));
  root.replaceChildren(card);
}

export function renderError(root, message) {
  root.replaceChildren(el("div", { className: "card" }, el("p", { className: "error" }, message)));
}
