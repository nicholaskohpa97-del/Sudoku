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


// ---------------------------------------------------------------------------
// Email invites. The game has no mail server (that would need a paid/verified
// sending domain), so invites open the player's own email app with the
// message pre-written: free, and it arrives from someone the friend knows.

export const MAX_EMAIL_INVITES = 20;

// Deliberately simple: one "@", no spaces, a dot in the domain.
const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]{2,}$/;

/** Splits pasted text (commas, semicolons, spaces, new lines) into valid and invalid addresses, de-duplicated. */
export function parseEmails(input: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const raw of input.split(/[\s,;]+/)) {
    const token = raw.replace(/^<|>$/g, "").trim();
    if (!token) continue;
    const email = token.toLowerCase();
    if (!EMAIL.test(email)) {
      if (!invalid.includes(token)) invalid.push(token);
    } else if (!valid.includes(email)) {
      valid.push(email);
    }
  }
  return { valid, invalid };
}

export interface InviteEmail {
  /** "room" or "tournament", for the wording. */
  kind: "room" | "tournament";
  code: string;
  url: string;
  /** Tournament name, if any. */
  name?: string;
  /** Who is inviting (player name). */
  from?: string | null;
}

export function inviteEmailText(invite: InviteEmail): { subject: string; body: string } {
  const who = invite.from?.trim() || "A friend";
  const what =
    invite.kind === "room" ? `a Sudoku race (room ${invite.code})` : `the "${invite.name ?? invite.code}" Sudoku tournament`;
  const subject = `${who} invited you to ${invite.kind === "room" ? "a Sudoku race" : `"${invite.name ?? "a Sudoku tournament"}"`} 🧩`;
  const body = [
    `Hi!`,
    ``,
    `${who} has invited you to ${what}.`,
    ``,
    `Tap to join: ${invite.url}`,
    ``,
    `Or open the game and enter the code ${invite.code}. No sign-up needed, just pick a player name.`,
    ``,
    `See you on the grid!`,
  ].join("\n");
  return { subject, body };
}

/** mailto: link with every recipient and the pre-written invite. */
export function inviteMailto(emails: string[], invite: InviteEmail): string {
  const { subject, body } = inviteEmailText(invite);
  // Commas between addresses must stay literal; only the parts are encoded.
  const to = emails.map((e) => encodeURIComponent(e).replace(/%40/g, "@")).join(",");
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
