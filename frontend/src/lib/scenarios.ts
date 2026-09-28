import type { Scenario } from "@/api/types";

/** The launcher's scenario dropdown. Section 5.1 of video-call-scenario.md. */
export const SCENARIOS = [
  {
    id: "ats_interview",
    label: "ATS interview",
    description: "Three scripted liveness and voice prompts inside a recruiting portal.",
  },
  {
    id: "video_call",
    label: "Video call",
    description: "A conferencing call with passive monitoring and one surprise challenge.",
  },
] as const satisfies readonly { id: Scenario; label: string; description: string }[];

export const DEFAULT_SCENARIO: Scenario = "ats_interview";

export const SCENARIO_LABELS = Object.fromEntries(
  SCENARIOS.map((scenario) => [scenario.id, scenario.label]),
) as Record<Scenario, string>;

export function isScenario(value: unknown): value is Scenario {
  return SCENARIOS.some((scenario) => scenario.id === value);
}
