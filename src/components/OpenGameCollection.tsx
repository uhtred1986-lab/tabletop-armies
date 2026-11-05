"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setGame } from "@/app/actions";
import type { GameId } from "@/games/types";
import { useT } from "@/i18n/client";

export function OpenGameCollection({ gameId }: { gameId: GameId }) {
  const t = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);
  return <>
    <button type="button" className="btn w-btn" disabled={pending} onClick={() => start(async () => {
      setFailed(false);
      try {
        const result = await setGame(gameId);
        if (!result.ok) { setFailed(true); return; }
        router.push("/collection");
        router.refresh();
      } catch { setFailed(true); }
    })}>{t("hub.open")}</button>
    {failed && <p role="alert">{t("error.body")}</p>}
  </>;
}
