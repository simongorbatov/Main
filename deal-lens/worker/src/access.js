// While Deal Lens is in private testing, every request must carry the access code
// (a Worker secret). The code is compared as SHA-256 digests in constant time.
async function digest(text) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

export async function hasAccess(env, request) {
  if (!env.ACCESS_CODE) return true;
  const given = request.headers.get("x-deal-lens-code") || "";
  const [a, b] = await Promise.all([digest(given), digest(env.ACCESS_CODE)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
