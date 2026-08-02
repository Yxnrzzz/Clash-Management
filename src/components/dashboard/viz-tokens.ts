/**
 * Chart tokens, validated with the dataviz palette validator against this app's
 * actual card surface (#ffffff) — not the reference surface:
 *
 *   categorical [series1, series2]  → all checks PASS (adjacent CVD ΔE 24.7)
 *   priority ordinal ramp (4 steps) → all checks PASS (monotone L, light end 2.11:1)
 *
 * Re-run the validator if any hex here changes.
 */
export const VIZ = {
  surface: "#ffffff",
  gridline: "#e1e0d9",
  axis: "#c3c2b7",
  muted: "#898781",
  textSecondary: "#52514e",

  /** Categorical slots — identity. Used only where series ARE the subject. */
  series1: "#2a78d6",
  series2: "#eb6834",

  /**
   * Ordinal ramp for priority (Low → Critical). Priority is an ordered tier,
   * so a one-hue ramp is legitimate here; nominal dimensions (discipline,
   * zone) get a single flat color instead.
   */
  priorityRamp: ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab"],
} as const;

export const AXIS_TICK = { fill: VIZ.muted, fontSize: 12 };
