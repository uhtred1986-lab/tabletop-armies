import type { Phase } from "@/games/types";
import { useT, type StringKey } from "@/i18n";

/** The turn's phases; the current one is the screen's single accent fill (docs/ui-standard.md). */
export const PhaseRail = ({ phases, current }: { phases: Phase[]; current: string }) => {
  const t = useT();
  return (
    <div className="phase-rail">
      {phases.map((p) => (
        <div key={p.id} aria-current={p.id === current ? "step" : undefined}>
          {t(p.labelKey as StringKey)}
        </div>
      ))}
    </div>
  );
};
