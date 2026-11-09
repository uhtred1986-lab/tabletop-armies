import type { PlayBattleplan } from "@/lib/play/replay";
import type { FeatureTranslate } from "@/i18n/features/play";

/** The battleplan's deployment map as the owner entered it (inches, origin top-left), drawn with world tokens. */
export function BattleplanMap({ map, t }: { map: NonNullable<PlayBattleplan["map"]>; t: FeatureTranslate }) {
  const label = (side: "attacker" | "defender" | "neutral") => t(side === "attacker" ? "setup.mapAttacker" : side === "defender" ? "setup.mapDefender" : "setup.mapNeutral");
  const centre = (points: [number, number][]) => points.reduce(([x, y], [px, py]) => [x + px / points.length, y + py / points.length], [0, 0]);
  const unit = Math.max(map.width, map.height) / 60;
  return <figure className="battleplan-map">
    <svg viewBox={`0 0 ${map.width} ${map.height}`} role="img" aria-label={t("setup.map")}>
      <rect x="0" y="0" width={map.width} height={map.height} className="battleplan-board" />
      {map.territories.map((area, index) => {
        const [x, y] = centre(area.points);
        return <g key={index}>
          <polygon points={area.points.map(([px, py]) => `${px},${py}`).join(" ")} className={`battleplan-territory ${area.side}`} />
          <text x={x} y={y} className="battleplan-label" fontSize={2.2 * unit} textAnchor="middle" dominantBaseline="middle">{label(area.side)}</text>
        </g>;
      })}
      {map.objectives.map((objective, index) => <g key={`o${index}`}>
        <circle cx={objective.x} cy={objective.y} r={1.6 * unit} className="battleplan-objective"><title>{objective.label ?? t("setup.mapObjective")}</title></circle>
      </g>)}
    </svg>
    <figcaption className="label">{t("setup.map")} · {map.width}″ × {map.height}″</figcaption>
  </figure>;
}
