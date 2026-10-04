// Reads the listing on the current page. It runs inside the page through
// chrome.scripting.executeScript, so it must not use anything defined outside this function.
export function readListing() {
  const MAX_PHOTOS = 4;
  const MAX_PAGE_TEXT = 8000;
  const PRICE = /(?:US\s?)?(?:[A-Z]{2})?\$\s?\d[\d,]*(?:\.\d{2})?|£\s?\d[\d,]*(?:\.\d{2})?|€\s?\d[\d.,]*/;

  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const q = (selector, scope = document) => scope.querySelector(selector);
  const qa = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
  const textOf = (node) => (node ? clean(node.innerText || node.textContent) : "");
  const meta = (key) => clean(q(`meta[property="${key}"]`)?.content || q(`meta[name="${key}"]`)?.content);

  const host = location.hostname.replace(/^www\./, "");
  const site =
    q('meta[name="deal-lens-test-site"]')?.content ||
    (/(^|\.)facebook\.com$/.test(host)
      ? "facebook"
      : /(^|\.)craigslist\.org$/.test(host)
        ? "craigslist"
        : /(^|\.)offerup\.com$/.test(host)
          ? "offerup"
          : /(^|\.)ebay\.[a-z.]+$/.test(host)
            ? "ebay"
            : "other");

  // The part of the page that holds the listing: a dialog or main area with a heading in it.
  const root =
    ["[role='dialog']", "[role='main']", "main", "article"]
      .map((selector) => qa(selector).find((node) => q("h1", node)))
      .find(Boolean) || document.body;
  const heading = q("h1", root);

  // Structured data (schema.org JSON-LD) that many shops and dealers publish.
  const ldNodes = [];
  for (const script of qa('script[type="application/ld+json"]')) {
    try {
      const stack = [JSON.parse(script.textContent)];
      while (stack.length) {
        const node = stack.pop();
        if (Array.isArray(node)) stack.push(...node);
        else if (node && typeof node === "object") {
          ldNodes.push(node);
          if (node["@graph"]) stack.push(node["@graph"]);
        }
      }
    } catch {
      // Broken JSON-LD: the page still has other signals.
    }
  }
  const typeOf = (node) => [].concat(node["@type"] || []).join(" ");
  const ld = ldNodes.find((node) => /\b(Product|Vehicle|Car|Motorcycle|IndividualProduct)\b/.test(typeOf(node))) || null;
  const offer = ld ? [].concat(ld.offers || [])[0] || null : null;

  // The text block right after a label such as "Details" or "Description".
  const sectionAfter = (labels) => {
    const label = qa("h2, h3, h4, span, div, dt, strong", root).find(
      (node) => node.children.length === 0 && labels.includes(clean(node.textContent)),
    );
    for (let node = label; node && node !== root; node = node.parentElement) {
      const next = node.nextElementSibling;
      if (next && textOf(next)) return textOf(next).slice(0, 3000);
    }
    return "";
  };

  // The first money amount next to the heading, which is where most sites print the price.
  const priceNear = (node) => {
    if (!node) return "";
    const box = node.parentElement?.parentElement || root;
    const match = textOf(box).replace(textOf(node), "").match(PRICE);
    return match ? clean(match[0]) : "";
  };

  const ldDetails = () => {
    if (!ld) return [];
    const show = (value) =>
      value && typeof value === "object"
        ? clean(value.name || [value.value, value.unitText || value.unitCode].filter(Boolean).join(" "))
        : clean(value).replace(/^https?:\/\/schema\.org\//, "");
    const labels = {
      brand: "Brand",
      model: "Model",
      vehicleModelDate: "Year",
      mileageFromOdometer: "Mileage",
      color: "Color",
      itemCondition: "Condition",
      vehicleTransmission: "Transmission",
      fuelType: "Fuel",
      bodyType: "Body",
    };
    return Object.entries(labels)
      .filter(([key]) => ld[key])
      .map(([key, label]) => `${label}: ${show(ld[key])}`);
  };

  const readers = {
    craigslist() {
      const body = q("#postingbody");
      let description = "";
      if (body) {
        const copy = body.cloneNode(true);
        qa(".print-information, .print-qrcode-container", copy).forEach((node) => node.remove());
        description = clean(copy.textContent);
      }
      const attrs = qa(".attrgroup .attr");
      return {
        title: textOf(q("#titletextonly")),
        price: textOf(q(".postingtitletext .price")) || textOf(q(".price")),
        location: textOf(q(".postingtitletext small")).replace(/^\(\s*|\s*\)$/g, ""),
        description,
        details: (attrs.length ? attrs : qa(".attrgroup span")).map(textOf),
        photos: [
          ...qa("#thumbs a[href]").map((link) => link.href),
          ...qa(".gallery img, .swipe img").map((img) => img.currentSrc || img.src),
        ],
      };
    },
    ebay() {
      const condition = textOf(q(".x-item-condition-text"));
      return {
        title: textOf(q("h1.x-item-title__mainTitle")) || textOf(q("#itemTitle")),
        price: textOf(q(".x-price-primary")) || clean(q("[itemprop='price']")?.getAttribute("content")),
        details: [
          condition && `Condition: ${condition}`,
          ...qa(".ux-labels-values").map((row) => {
            const label = textOf(q(".ux-labels-values__labels", row)).replace(/:$/, "");
            const value = textOf(q(".ux-labels-values__values", row));
            return label && value ? `${label}: ${value}` : "";
          }),
        ],
        photos: qa(".ux-image-carousel-item img").map(
          (img) => img.getAttribute("data-zoom-src") || img.getAttribute("data-src") || img.currentSrc || img.src,
        ),
      };
    },
    facebook() {
      // Facebook's class names change constantly, so this reads page structure and wording only.
      const listed = String(root.innerText || "").match(/Listed .*? in ([^\n]+)/);
      const details = sectionAfter(["Details"]);
      return {
        title: textOf(heading),
        price: priceNear(heading),
        location: listed ? clean(listed[1]) : "",
        description: sectionAfter(["Seller's description", "Seller’s description", "Description"]),
        details: details ? [details] : [],
      };
    },
    offerup() {
      const condition = sectionAfter(["Condition"]);
      return {
        price: priceNear(heading),
        description: sectionAfter(["Description"]),
        details: condition ? [`Condition: ${condition}`] : [],
      };
    },
  };

  const generic = {
    title: clean(ld?.name) || meta("og:title") || textOf(heading) || clean(document.title),
    price:
      (offer?.price ? clean(`${offer.priceCurrency || ""} ${offer.price}`) : "") ||
      (meta("product:price:amount")
        ? clean(`${meta("product:price:currency")} ${meta("product:price:amount")}`)
        : "") ||
      meta("og:price:amount") ||
      priceNear(heading),
    location: "",
    description:
      clean(ld?.description) ||
      sectionAfter(["Description", "Seller's description", "About this item"]) ||
      meta("og:description") ||
      meta("description"),
    details: ldDetails(),
    photos: [
      ...[].concat(ld?.image || []).map((image) => (typeof image === "string" ? image : image?.url || image?.contentUrl)),
      meta("og:image"),
    ],
  };

  const specific = Object.hasOwn(readers, site) ? readers[site]() : {};
  const pick = (key) => clean(specific[key]) || clean(generic[key]);

  // Large images in the listing area, biggest first; small ones are icons and avatars.
  const pagePhotos = qa("img", root)
    .map((img) => ({ img, rect: img.getBoundingClientRect() }))
    .filter(
      ({ img, rect }) =>
        (img.naturalWidth >= 300 && img.naturalHeight >= 200) || (rect.width >= 250 && rect.height >= 180),
    )
    .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)
    .map(({ img }) => img.currentSrc || img.src);

  const absolute = (url) => {
    try {
      return new URL(url, location.href).href;
    } catch {
      return "";
    }
  };
  // Ask for a mid-size copy of each photo: big enough to judge condition, small enough to keep checks cheap.
  const midSize = (url) =>
    url
      .replace(/(images\.craigslist\.org\/.+?)_\d+x\d+c?\.jpg/i, "$1_600x450.jpg")
      .replace(/\/s-l\d+\.(jpe?g|png|webp)/i, "/s-l960.$1");
  const photos = [
    ...new Set(
      [...(specific.photos || []), ...generic.photos, ...pagePhotos]
        .filter(Boolean)
        .map(absolute)
        .map(midSize)
        .filter((url) => /^https?:/.test(url) && !/\.svg(\?|$)|logo|sprite|avatar|icon/i.test(url)),
    ),
  ].slice(0, MAX_PHOTOS);

  // A VIN with a valid check digit, from structured data or the page text.
  const vinOk = (vin) => {
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin) || !/[A-Z]/.test(vin)) return false;
    const values = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
    const weights = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 17; i++) sum += (/\d/.test(vin[i]) ? Number(vin[i]) : values[vin[i]]) * weights[i];
    return vin[8] === (sum % 11 === 10 ? "X" : String(sum % 11));
  };
  const findVin = () => {
    const fromLd = clean(ld?.vehicleIdentificationNumber).toUpperCase();
    if (vinOk(fromLd)) return fromLd;
    for (const match of String(root.innerText || "").matchAll(/\b[A-HJ-NPR-Z0-9]{17}\b/g)) {
      if (vinOk(match[0])) return match[0];
    }
    return "";
  };

  return {
    url: location.href,
    site,
    title: pick("title").slice(0, 300),
    price: pick("price").slice(0, 60),
    location: pick("location").slice(0, 120),
    description: pick("description").slice(0, 3000),
    details: [...new Set([...(specific.details || []), ...generic.details].map(clean).filter(Boolean))].slice(0, 30),
    photos,
    vin: findVin(),
    pageText: String(root.innerText || "")
      .replace(/[ \t]+/g, " ")
      .replace(/\s*\n\s*/g, "\n")
      .trim()
      .slice(0, MAX_PAGE_TEXT),
  };
}
