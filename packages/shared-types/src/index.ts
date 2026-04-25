export type Lift = "squat" | "bench" | "deadlift";

export type RiskSeverity = "info" | "warn" | "high";

export type RiskSide = "left" | "right" | "both";

/** Structured output from the in-browser rules engine (§3.3 of project plan). */
export type RiskEvent = {
  rule_id: string;
  lift: Lift;
  rep_index: number;
  severity: RiskSeverity;
  measured: number;
  threshold: number;
  frame_range: [number, number];
  confidence: number;
  side?: RiskSide;
};
