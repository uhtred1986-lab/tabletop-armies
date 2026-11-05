import type { ReactNode } from "react";
import { requireOwnerPage } from "@/lib/auth";
import { NavRail } from "@/components/NavRail";

/** Every owner screen: signed in (second lock after the proxy), the rail on the left. */
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireOwnerPage();
  return (
    <div className="shell">
      <NavRail />
      <main className="main">{children}</main>
    </div>
  );
}
