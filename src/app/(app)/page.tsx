import { requireOwnerPage } from "@/lib/auth";
import { getLocale } from "@/i18n/server";
import { currentGame } from "@/lib/current-game";
import { loadHomeData } from "@/features/home/load";
import { SceneBackdrop } from "@/components/SceneBackdrop";
import { WorldHome } from "@/components/world-home/WorldHome";

export const dynamic = "force-dynamic";

/** The current game's home, laid out the way its world is (docs/ui-standard.md §3, "World homes"). */
export default async function HomePage() {
  await requireOwnerPage();
  const [game, locale] = await Promise.all([currentGame(), getLocale()]);
  const data = await loadHomeData(game, locale);
  return (
    <>
      <SceneBackdrop area="hub" />
      <WorldHome data={data} />
    </>
  );
}
