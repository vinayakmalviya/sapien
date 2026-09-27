import type { GetResultResponse } from "@/api/types";
import { ScoreBar } from "./ScoreBar";

/**
 * Groups the three score bars. Section 10.2 of frontend-handoff.md.
 *
 * The `thresholds` object in ui-contract.md Section 7.1 has no
 * liveness-specific value — only `frame_fake`, `voice_real`, and
 * `voice_fake`. The liveness bar therefore draws no marker; its caption
 * shows `prompts_passed` from `module_detail` instead of inventing a
 * threshold that the API never sent. The voice bar draws two markers —
 * the band between them is Section 15.3's uncertain zone.
 */
export function ComponentScorePanel({ result }: { result: GetResultResponse }) {
  const { component_scores, module_detail, thresholds, weights } = result;

  return (
    <div className="flex flex-col gap-6">
      <ScoreBar
        label="Liveness"
        score={component_scores.liveness_scorer}
        weight={weights.liveness}
        caption={
          module_detail.liveness_scorer.enabled
            ? `${module_detail.liveness_scorer.prompts_passed}/${module_detail.liveness_scorer.prompts_total} prompts passed`
            : undefined
        }
      />
      <ScoreBar
        label="Frame"
        score={component_scores.frame_classifier}
        weight={weights.frame}
        markers={[{ value: thresholds.frame_fake, label: "fake below" }]}
        caption={
          module_detail.frame_classifier.enabled
            ? `${module_detail.frame_classifier.frames_scored} frames scored`
            : undefined
        }
      />
      <ScoreBar
        label="Voice"
        score={component_scores.voice_detection}
        weight={weights.voice}
        markers={[
          { value: thresholds.voice_real, label: "real above" },
          { value: thresholds.voice_fake, label: "fake below" },
        ]}
        caption={
          module_detail.voice_detection.enabled
            ? `label: ${module_detail.voice_detection.label}`
            : undefined
        }
      />
    </div>
  );
}
