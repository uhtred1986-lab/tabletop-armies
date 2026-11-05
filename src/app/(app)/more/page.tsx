import Link from "next/link";
import { getT } from "@/i18n/server";
import { SceneBackdrop } from "@/components/SceneBackdrop";
import { MoreActions } from "./MoreActions";
import { requireOwnerPage } from "@/lib/auth";

export default async function MorePage() {
  const owner = await requireOwnerPage();
  const t = await getT();
  return <><SceneBackdrop area="hub" /><h1 className="w-display page-title">{t("nav.more")}</h1>
    <div className="more-links">{([
      ["/", "nav.hub"], ["/places", "nav.places"], ["/stats", "nav.stats"],
      ["/campaigns", "nav.campaigns"], ["/data", "nav.data"], ["/kit", "nav.kit"],
      ["/reference", "nav.reference"],
    ] as const).map(([href, key]) => <Link className="w-card card-pad" key={href} href={href}>{t(key)}</Link>)}</div>
    <MoreActions owner={owner.email} />
  </>;
}
