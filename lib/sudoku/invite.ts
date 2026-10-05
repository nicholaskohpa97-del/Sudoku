// Invite-code parsing shared by the join forms and the API.

/** Path segments that carry a room or league code in an invite URL. */
const INVITE_PATH = /\/sudoku\/(?:room|league)\/([^/?#\s]+)/i;

/** Uppercases a code and strips anything that isn't a letter or digit. */
export function normaliseCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Accepts a bare code ("abc 123", "ABC-123") or a pasted invite link
 * ("https://…/sudoku/room/ABC123") and returns the normalised code.
 */
export function parseInviteCode(input: string): string {
  const fromUrl = INVITE_PATH.exec(input);
  let raw = input;
  if (fromUrl) {
    try {
      raw = decodeURIComponent(fromUrl[1]);
    } catch {
      raw = fromUrl[1];
    }
  }
  return normaliseCode(raw);
}

/**
 * Where to send the player after Google sign-in. Only same-site relative
 * paths are allowed, so the callback can't be used as an open redirect.
 */
export function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/sudoku";
  return value;
}
