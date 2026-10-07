import { isReservedName, nameKey, suggestNames } from "@/lib/sudoku/names";
import { HttpError } from "./errors";
import type { Db } from "./store";

/** True if another player already uses this name (ignoring case, accents and punctuation). */
export function isNameTaken(db: Db, name: string, exceptId?: string): boolean {
  const key = nameKey(name);
  return Object.values(db.players).some((p) => p.id !== exceptId && nameKey(p.name) === key);
}

/** Throws 409 with suggestions if the name is taken, 400 if it's reserved or has nothing to identify it. */
export function assertNameFree(db: Db, name: string, exceptId?: string): void {
  if (nameKey(name).length === 0) throw new HttpError(400, "Use at least one letter or number");
  if (isReservedName(name)) throw new HttpError(400, `"${name}" is reserved. Pick another name`);
  if (isNameTaken(db, name, exceptId)) {
    throw new HttpError(409, `"${name}" is already taken`, { suggestions: suggestNames(name, (n) => isNameTaken(db, n, exceptId)) });
  }
}
