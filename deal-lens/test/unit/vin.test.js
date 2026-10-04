import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeVin, isValidVin } from "../../worker/src/vin.js";
import { fakeNhtsaFetch } from "../helpers/servers.js";

const VIN = "1HGCM82633A004352"; // NHTSA's own sample VIN, a 2003 Honda Accord

test("accepts a VIN whose check digit is right", () => {
  assert.equal(isValidVin(VIN), true);
});

test("rejects a wrong check digit, banned letters, wrong lengths and all-digit strings", () => {
  assert.equal(isValidVin("1HGCM82643A004352"), false); // check digit changed
  assert.equal(isValidVin("1HGCM82633AO04352"), false); // the letter O never appears in a VIN
  assert.equal(isValidVin(VIN.slice(0, 16)), false);
  assert.equal(isValidVin("12345678901234567"), false);
  assert.equal(isValidVin(undefined), false);
});

test("decodes a VIN through NHTSA and links its recall lookup", async () => {
  const info = await decodeVin(VIN, fakeNhtsaFetch);
  assert.deepEqual([info.year, info.make, info.model, info.trim], ["2003", "Honda", "Accord", "EX"]);
  assert.equal(info.note, "");
  assert.equal(info.recallsUrl, `https://www.nhtsa.gov/recalls?vin=${VIN}`);
});

test("a failed lookup still returns the VIN, with a note", async () => {
  const info = await decodeVin(VIN, async () => {
    throw new Error("offline");
  });
  assert.equal(info.vin, VIN);
  assert.equal(info.make, "");
  assert.match(info.note, /didn't answer/);
});
