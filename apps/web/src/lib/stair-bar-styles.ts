import type { StairBarSetId } from "@nola/calc-core";

/**
 * One colour per stair bar set (decision V3), shared by the reinforcement
 * table chips, section, plan and 3-D rebar layer so the set being edited
 * can be found at a glance; marks match the bar schedule.
 */
export const stairBarColors: Record<StairBarSetId, string> = {
  mainBottom: "#145da0",
  topBottom: "#e87916",
  topTop: "#b42318",
  topKnee: "#a21caf",
  distribution: "#0f766e",
};
export const stairBarSetIds: StairBarSetId[] = [
  "mainBottom",
  "topBottom",
  "topTop",
  "topKnee",
  "distribution",
];
/** Opacity of a set while another set is highlighted. */
export const dimmed = (highlight: StairBarSetId | null, set: StairBarSetId) =>
  highlight && highlight !== set ? 0.18 : 1;
