"use client";
import { useEffect } from "react";
import { setActiveOfflineOwner } from "@/lib/play/offline-store";

/** Registers the static-only worker. Private pages and data are never placed in Cache Storage. */
export function OfflineRuntime({ owner, world }: { owner: string; world: string }) {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).then(async () => {
        const registration = await navigator.serviceWorker.ready;
        registration.active?.postMessage({ type: "cache-play-background", world });
      });
    }
    void setActiveOfflineOwner(owner).catch(() => undefined);
  }, [owner, world]);
  return null;
}
