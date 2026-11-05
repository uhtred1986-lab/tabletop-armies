"use client";
import { useState, type FormEvent } from "react";
import { discardOwnerOfflineData, listOwnerOperations } from "@/lib/play/offline-store";

export function OfflineSignOutButton({ owner, label, queuedWarning, clearFailure }: { owner: string; label: string; queuedWarning: (count: number) => string; clearFailure: string }) {
  const [busy, setBusy] = useState(false);

  async function signOut(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    setBusy(true);
    try {
      const queued = await listOwnerOperations(owner);
      if (!window.confirm(queuedWarning(queued.length))) { setBusy(false); return; }
      await discardOwnerOfflineData(owner);
      form.submit();
    } catch {
      const continueWithoutClearing = window.confirm(clearFailure);
      if (continueWithoutClearing) form.submit();
      else setBusy(false);
    }
  }

  return <form method="post" action="/api/auth/logout" onSubmit={signOut}>
    <button type="submit" className="rail-link" disabled={busy}>{label}</button>
  </form>;
}
