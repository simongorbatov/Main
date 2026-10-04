// One Deal Check: decode the VIN, then ask the model (or the mock) for a verdict.
import Anthropic from "@anthropic-ai/sdk";
import { mockVerdict } from "./mock.js";
import { SYSTEM_PROMPT, buildUserContent } from "./prompt.js";
import { VERDICT_SCHEMA } from "./schema.js";
import { decodeVin, isValidVin } from "./vin.js";

const DEFAULT_MODEL = "claude-opus-5-5";
// Models that take output_config.effort and server-side refusal fallbacks.
const CURRENT_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5", "claude-opus-5", "claude-fable-5-1"]);
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
// USD per million tokens [input, output], for the cost estimate on each answer.
const PRICES = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-4-5": [1, 5],
  "claude-opus-5": [5, 25],
  "claude-opus-4-8": [5, 25],
};

export const isMock = (env) => env.MOCK === "1" || !env.ANTHROPIC_API_KEY;
export const modelFor = (env) => env.MODEL || DEFAULT_MODEL;

const ok = (body) => ({ status: 200, body });
const fail = (status, code, message) => ({ status, body: { error: { code, message } } });

function isPublicHttps(url) {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== "https:") return false;
    return (
      !/^(localhost|127\.|10\.|0\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/.test(hostname) &&
      !hostname.endsWith(".local")
    );
  } catch {
    return false;
  }
}

function estimateCost(model, usage) {
  const price = PRICES[model];
  if (!price || typeof usage.input_tokens !== "number") return null;
  return Number(((usage.input_tokens * price[0] + (usage.output_tokens || 0) * price[1]) / 1e6).toFixed(4));
}

function askClaude(client, model, content) {
  const params = {
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
    output_config: { format: { type: "json_schema", schema: VERDICT_SCHEMA } },
  };
  if (!CURRENT_MODELS.has(model)) return client.messages.create(params);
  params.output_config.effort = "low";
  // If a safety classifier declines, the API reruns the request on Anthropic's recommended fallback model.
  return client.beta.messages.create({ ...params, betas: [FALLBACK_BETA], fallbacks: "default" });
}

function apiFailure(err) {
  if (err instanceof Anthropic.RateLimitError) return fail(503, "busy", "Deal Lens is busy. Try again in a minute.");
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    console.error("Anthropic rejected the API key:", err.message);
    return fail(500, "not_configured", "Deal Lens isn't set up correctly yet.");
  }
  if (err instanceof Anthropic.APIError) {
    console.error("Anthropic API error:", err.status, err.message);
    return fail(502, "ai_error", "The check didn't go through. Try again in a minute.");
  }
  console.error("Check failed:", err);
  return fail(500, "internal", "Something went wrong. Try again.");
}

export async function runCheck({ listing, screenshot }, env, deps = {}) {
  const vinCheck = isValidVin(listing.vin) ? await decodeVin(listing.vin, deps.fetch || fetch) : null;
  if (isMock(env)) return ok({ ...mockVerdict(listing), vinCheck, meta: { mock: true } });

  const client = deps.anthropic || new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 90_000 });
  const model = modelFor(env);
  const photoUrls = listing.photos.filter(isPublicHttps).slice(0, screenshot ? 3 : 4);
  const ask = (urls) => askClaude(client, model, buildUserContent({ listing, screenshot, photoUrls: urls, vinCheck }));

  let response;
  try {
    try {
      response = await ask(photoUrls);
    } catch (err) {
      // A photo the API can't download fails the whole request, so retry once without the photo links.
      if (!(err instanceof Anthropic.BadRequestError) || photoUrls.length === 0) throw err;
      response = await ask([]);
    }
  } catch (err) {
    return apiFailure(err);
  }

  if (response.stop_reason === "refusal") return fail(422, "declined", "Deal Lens couldn't check this listing.");
  let verdict = null;
  try {
    verdict = JSON.parse(response.content.find((block) => block.type === "text")?.text ?? "");
  } catch {
    // Reported below with the max_tokens case.
  }
  if (response.stop_reason === "max_tokens" || !verdict) {
    return fail(502, "bad_answer", "The check didn't finish. Try again.");
  }

  const usage = response.usage || {};
  const meta = {
    mock: false,
    model: response.model,
    usage: { inputTokens: usage.input_tokens ?? null, outputTokens: usage.output_tokens ?? null },
    estCostUsd: estimateCost(response.model, usage),
  };
  console.log(JSON.stringify({ event: "check", site: listing.site, ...meta }));
  return ok({ ...verdict, vinCheck, meta });
}
