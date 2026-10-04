// Draws the toolbar icon (a white magnifier on a green rounded square) at every size Chrome asks for.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { encodePng } from "./png.js";

const GREEN = [23, 105, 74];
const SAMPLES = 4; // per axis, for smooth edges

const insideRoundedSquare = (x, y, size, radius) => {
  const cx = Math.min(Math.max(x, radius), size - radius);
  const cy = Math.min(Math.max(y, radius), size - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
};

function distanceToSegment(px, py, ax, ay, bx, by) {
  const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
  return Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
}

function drawIcon(size) {
  const rgba = new Uint8Array(size * size * 4);
  const ring = { c: size * 0.43, r: size * 0.24, w: Math.max(size * 0.09, 1.6) };
  const handle = { a: size * 0.6, b: size * 0.8, w: Math.max(size * 0.12, 2) };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let background = 0;
      let mark = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const px = x + (sx + 0.5) / SAMPLES;
          const py = y + (sy + 0.5) / SAMPLES;
          if (!insideRoundedSquare(px, py, size, size * 0.22)) continue;
          background++;
          const onRing = Math.abs(Math.hypot(px - ring.c, py - ring.c) - ring.r) <= ring.w / 2;
          const onHandle = distanceToSegment(px, py, handle.a, handle.a, handle.b, handle.b) <= handle.w / 2;
          if (onRing || onHandle) mark++;
        }
      }
      const i = (y * size + x) * 4;
      const white = background ? mark / background : 0;
      for (let ch = 0; ch < 3; ch++) rgba[i + ch] = Math.round(GREEN[ch] * (1 - white) + 255 * white);
      rgba[i + 3] = Math.round((background / SAMPLES ** 2) * 255);
    }
  }
  return encodePng(size, size, rgba);
}

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../extension/icons");
mkdirSync(out, { recursive: true });
for (const size of [16, 32, 48, 128]) writeFileSync(path.join(out, `icon${size}.png`), drawIcon(size));
console.log(`Wrote icons to ${out}`);
