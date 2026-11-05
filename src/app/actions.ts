"use server";
import { cookies } from "next/headers";
import { requireOwner } from "@/lib/auth";
import { GAME_COOKIE, isGameId } from "@/lib/current-game";
import { LOCALE_COOKIE, isLocale } from "@/i18n";

/** Shell-wide Server Functions. Each opens with `requireOwner()` and returns its failure, never throws (CLAUDE.md rule 9). */

const YEAR = 365 * 24 * 60 * 60;
type Result = { ok: true } | { ok: false; error: string };

export async function setGame(gameId: string): Promise<Result> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  if (!isGameId(gameId)) return { ok: false, error: "unknown-game" };
  (await cookies()).set(GAME_COOKIE, gameId, { path: "/", maxAge: YEAR, sameSite: "lax" });
  return { ok: true };
}

export async function setLocale(locale: string): Promise<Result> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  if (!isLocale(locale)) return { ok: false, error: "unknown-locale" };
  (await cookies()).set(LOCALE_COOKIE, locale, { path: "/", maxAge: YEAR, sameSite: "lax" });
  return { ok: true };
}
