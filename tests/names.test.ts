import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertNameFree, isNameTaken } from "@/lib/server/names";
import type { Db } from "@/lib/server/store";
import { anonymousName, isReservedName, nameKey, randomName, suggestNames } from "@/lib/sudoku/names";

const db = (...names: string[]): Db => ({
  version: 1,
  players: Object.fromEntries(names.map((n, i) => [`p${i}`, { id: `p${i}`, name: n, tokenHash: "", createdAt: 0 }])),
  rooms: {},
  leagues: {},
  matches: [],
});

describe("player names", () => {
  it("treats case, accents, spaces and punctuation as the same name", () => {
    assert.equal(nameKey("Sneaky  Quokka!"), nameKey("sneaky-quokka"));
    assert.equal(nameKey("Zoë"), nameKey("zoe"));
    assert.notEqual(nameKey("Otter 1"), nameKey("Otter 2"));
  });

  it("rejects duplicates with free suggestions, but lets you keep your own name", () => {
    const d = db("Sneaky Quokka");
    assert.ok(isNameTaken(d, "sneaky-quokka"));
    assert.ok(!isNameTaken(d, "sneaky-quokka", "p0"));
    assert.doesNotThrow(() => assertNameFree(d, "sneaky-quokka", "p0"));
    try {
      assertNameFree(d, "SNEAKY QUOKKA");
      assert.fail("should have thrown");
    } catch (err) {
      const e = err as { status: number; data?: { suggestions: string[] } };
      assert.equal(e.status, 409);
      assert.equal(e.data!.suggestions.length, 3);
      for (const s of e.data!.suggestions) assert.ok(!isNameTaken(d, s));
    }
  });

  it("rejects reserved and empty names", () => {
    assert.ok(isReservedName("Admin"));
    assert.throws(() => assertNameFree(db(), "admin"), /reserved/);
    assert.throws(() => assertNameFree(db(), "!!!"), /at least one letter/);
  });

  it("generates plausible troll and anonymous names", () => {
    let n = 0;
    const rng = () => ((n += 0.137) % 1);
    assert.match(randomName(rng), /^[A-Z][a-z]+ [A-Z][a-z]+$/);
    assert.match(randomName(rng, true), /^[A-Z][a-z]+ [A-Z][a-z]+ \d\d$/);
    assert.match(anonymousName(rng), /^Anonymous [A-Z][a-z]+ \d{3}$/);
    assert.ok(randomName().length <= 24);
    assert.ok(anonymousName().length <= 24);
  });

  it("suggestions are built from a cleaned-up name", () => {
    const s = suggestNames("sneaky-QUOKKA!", () => false, 3);
    for (const name of s) assert.match(name, /^sneaky QUOKKA \d{1,2}$/);
  });

  it("suggestions avoid names in use", () => {
    const taken = new Set(["Pat 2", "Pat 3"]);
    const s = suggestNames("Pat", (n) => taken.has(n), 3);
    assert.equal(s.length, 3);
    for (const name of s) assert.ok(!taken.has(name));
  });
});
