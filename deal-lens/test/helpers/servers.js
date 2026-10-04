// Local stand-ins for the web: a server for the fixture pages and one that runs the Worker under Node.
import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { solidPng } from "../../tools/png.js";
import { handleRequest } from "../../worker/src/index.js";

const fixturesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");
const COLORS = [[201, 92, 54], [64, 120, 180], [90, 150, 90], [180, 160, 70]];

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      resolve({
        url: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

// Fixture pages from test/fixtures, and a generated PNG for any /img/ path
// (48px for avatars and thumbnails, 640x480 for photos).
export async function startFixtureServer() {
  const server = http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, "http://fixtures");
    if (pathname.startsWith("/img/")) {
      const small = /avatar|seller|50x50/.test(pathname);
      const color = COLORS[pathname.length % COLORS.length];
      res.writeHead(200, { "content-type": "image/png" });
      res.end(small ? solidPng(48, 48, color) : solidPng(640, 480, color));
      return;
    }
    try {
      const html = await readFile(path.join(fixturesDir, path.basename(pathname)), "utf8");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  return listen(server, 0);
}

// Runs the Worker's request handler behind a Node HTTP server and records every POST body.
export async function startWorkerServer({ port = 0, env = {}, deps = {} } = {}) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    if (req.method === "POST") {
      try {
        requests.push(JSON.parse(body.toString("utf8")));
      } catch {
        // The Worker answers bad JSON itself.
      }
    }
    const headers = { "content-type": req.headers["content-type"] || "text/plain" };
    if (req.headers["x-deal-lens-code"]) headers["x-deal-lens-code"] = req.headers["x-deal-lens-code"];
    const request = new Request(`http://127.0.0.1${req.url}`, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
    });
    const response = await handleRequest(request, env, deps);
    const out = Object.fromEntries(response.headers);
    // Chrome asks a local server for permission before an extension page calls it (Private Network Access).
    if (req.method === "OPTIONS") out["access-control-allow-private-network"] = "true";
    res.writeHead(response.status, out);
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  return { ...(await listen(server, port)), requests };
}

// Stands in for NHTSA's VIN decoder, which this container can't reach.
export async function fakeNhtsaFetch(url) {
  if (!String(url).startsWith("https://vpic.nhtsa.dot.gov/")) throw new Error(`Unexpected fetch: ${url}`);
  const row = {
    ModelYear: "2003",
    Make: "HONDA",
    Model: "Accord",
    Trim: "EX",
    BodyClass: "Coupe",
    ErrorCode: "0",
    ErrorText: "0 - VIN decoded clean. Check Digit (9th position) is correct",
  };
  return new Response(JSON.stringify({ Results: [row] }), { headers: { "content-type": "application/json" } });
}
