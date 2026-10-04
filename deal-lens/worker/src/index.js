// Deal Lens server (Cloudflare Worker). POST /v1/check takes one listing and returns a verdict.
import { hasAccess } from "./access.js";
import { isMock, modelFor, runCheck } from "./check.js";
import { takeDailyUse } from "./limits.js";
import { parseCheckRequest } from "./validate.js";

const MAX_BODY_CHARS = 3_000_000;
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, x-deal-lens-code",
  "access-control-max-age": "86400",
};

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS },
  });
const error = (status, code, message) => json(status, { error: { code, message } });

export async function handleRequest(request, env, deps = {}) {
  const { pathname } = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (pathname === "/v1/health" && request.method === "GET") {
    return json(200, { ok: true, mock: isMock(env), model: modelFor(env) });
  }
  if (pathname !== "/v1/check") return error(404, "not_found", "Not found.");
  if (request.method !== "POST") return error(405, "method_not_allowed", "Use POST.");
  if (!(await hasAccess(env, request))) {
    return error(401, "access_code", "Enter your Deal Lens access code to run checks.");
  }

  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_CHARS) {
    return error(413, "too_large", "That page is too big to check.");
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_CHARS) return error(413, "too_large", "That page is too big to check.");
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return error(400, "bad_json", "Bad request.");
  }
  const parsed = parseCheckRequest(input);
  if (!parsed.ok) return error(400, "bad_request", parsed.message);

  const quota = await takeDailyUse(env, parsed.installId);
  if (!quota.ok) {
    return error(429, "daily_limit", `You've used today's ${quota.limit} checks. They reset at midnight UTC.`);
  }

  const result = await runCheck(parsed, env, deps);
  return json(result.status, result.body);
}

export default {
  fetch: (request, env) => handleRequest(request, env),
};
