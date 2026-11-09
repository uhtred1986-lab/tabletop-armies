import type { HomeLayout } from "@/games/types";
import type { HomeData } from "@/features/home/types";
import { Ledger } from "./Ledger";
import { ComicPage } from "./ComicPage";
import { FieldMap } from "./FieldMap";
import { DuelScreen } from "./DuelScreen";
import { CaseFile } from "./CaseFile";

/** Picks the world's home by the game module's layout, never by game id (CLAUDE.md rule 1). */
const HOMES: Record<HomeLayout, (props: { data: HomeData }) => Promise<React.ReactNode>> = {
  ledger: Ledger,
  "comic-page": ComicPage,
  "field-map": FieldMap,
  duel: DuelScreen,
  "case-file": CaseFile,
};

export function WorldHome({ data }: { data: HomeData }) {
  const Home = HOMES[data.game.homeLayout];
  return <Home data={data} />;
}
