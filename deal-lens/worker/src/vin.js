// VIN check-digit validation and decoding through NHTSA's free vPIC service.
const LETTER_VALUES = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5,
  P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
const LOOKUP_FAILED = "The NHTSA lookup didn't answer.";

export function isValidVin(vin) {
  if (typeof vin !== "string" || !/^[A-HJ-NPR-Z0-9]{17}$/.test(vin) || !/[A-Z]/.test(vin)) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += (/\d/.test(vin[i]) ? Number(vin[i]) : LETTER_VALUES[vin[i]]) * WEIGHTS[i];
  const remainder = sum % 11;
  return vin[8] === (remainder === 10 ? "X" : String(remainder));
}

const titleCase = (text) =>
  String(text || "").toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, sep, letter) => sep + letter.toUpperCase());

export async function decodeVin(vin, fetchImpl = fetch) {
  const base = {
    vin,
    year: "",
    make: "",
    model: "",
    trim: "",
    bodyClass: "",
    note: "",
    recallsUrl: `https://www.nhtsa.gov/recalls?vin=${vin}`,
  };
  try {
    const res = await fetchImpl(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { ...base, note: LOOKUP_FAILED };
    const row = (await res.json())?.Results?.[0] || {};
    return {
      ...base,
      year: row.ModelYear || "",
      make: titleCase(row.Make),
      model: row.Model || "",
      trim: row.Trim || "",
      bodyClass: row.BodyClass || "",
      note: row.ErrorCode && row.ErrorCode !== "0" ? String(row.ErrorText || "").slice(0, 200) : "",
    };
  } catch {
    return { ...base, note: LOOKUP_FAILED };
  }
}
