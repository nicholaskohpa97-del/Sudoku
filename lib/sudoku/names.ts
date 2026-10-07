// Player names: unique across the app, and easy to make up on the spot. Pure,
// so the client suggests names and the server enforces uniqueness identically.

/** "Sneaky Quokka" and "sneaky-quokka!" are the same name. */
export function nameKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Names that would impersonate the app or its roles. */
const RESERVED = new Set(["guest", "anonymous", "admin", "administrator", "moderator", "mod", "support", "sudoku", "system", "you", "me", "null", "undefined"]);

export const isReservedName = (name: string) => RESERVED.has(nameKey(name));

const ADJECTIVES = [
  "Sneaky", "Grumpy", "Cosmic", "Turbo", "Wobbly", "Sleepy", "Spicy", "Mighty", "Cheeky", "Clever", "Dizzy", "Fuzzy", "Gloomy", "Happy",
  "Jolly", "Lazy", "Nimble", "Odd", "Plucky", "Quirky", "Rowdy", "Salty", "Tiny", "Unlucky", "Vivid", "Wily", "Zesty", "Bouncy",
  "Crafty", "Daring", "Electric", "Fearless", "Glitchy", "Hasty", "Icy", "Jazzy", "Keen", "Lucky", "Mellow", "Noisy",
];

const ANIMALS = [
  "Quokka", "Otter", "Panda", "Gecko", "Lemur", "Narwhal", "Pangolin", "Capybara", "Walrus", "Axolotl", "Badger", "Cobra", "Dingo",
  "Ferret", "Heron", "Ibis", "Jackal", "Koala", "Llama", "Manatee", "Newt", "Ocelot", "Puffin", "Raccoon", "Sloth", "Tapir", "Urchin",
  "Viper", "Wombat", "Yak", "Zebra", "Falcon", "Gibbon", "Hedgehog", "Iguana", "Kiwi", "Lynx", "Marmot", "Numbat", "Orca",
];

/** A random troll name like "Sneaky Quokka" (optionally with a number to dodge clashes). */
export function randomName(rng: () => number = Math.random, withNumber = false): string {
  const pick = <T,>(xs: T[]) => xs[Math.floor(rng() * xs.length)];
  const base = `${pick(ADJECTIVES)} ${pick(ANIMALS)}`;
  return withNumber ? `${base} ${10 + Math.floor(rng() * 90)}` : base;
}

/** "Anonymous Otter 47": no personal info, still unique-ish. */
export function anonymousName(rng: () => number = Math.random): string {
  const animal = ANIMALS[Math.floor(rng() * ANIMALS.length)];
  return `Anonymous ${animal} ${100 + Math.floor(rng() * 900)}`;
}

/** Up to `count` free variations of `base`: "Name 2", "Name 7"... */
export function suggestNames(base: string, isTaken: (name: string) => boolean, count = 3, rng: () => number = Math.random): string[] {
  const out: string[] = [];
  const stem =
    base
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .replace(/\s*\d+\s*$/, "")
      .trim()
      .slice(0, 21)
      .trim() || "Player";
  for (let tries = 0; out.length < count && tries < 60; tries++) {
    const candidate = `${stem} ${2 + Math.floor(rng() * 98)}`;
    if (!isTaken(candidate) && !out.includes(candidate)) out.push(candidate);
  }
  return out;
}
