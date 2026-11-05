/** The turn's phases; the current one is the screen's single accent fill (docs/ui-standard.md). Labels come translated. */
export const PhaseRail = ({ phases, current }: { phases: { id: string; label: string }[]; current: string }) => (
  <div className="phase-rail">
    {phases.map((p) => (
      <div key={p.id} aria-current={p.id === current ? "step" : undefined}>
        {p.label}
      </div>
    ))}
  </div>
);
