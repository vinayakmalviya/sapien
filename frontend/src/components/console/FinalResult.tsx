import type { GetResultResponse } from "@/api/types";
import { ComponentScorePanel } from "@/components/console/ComponentScorePanel";
import { ConfidenceGauge } from "@/components/console/ConfidenceGauge";
import { FlagReasonCard } from "@/components/console/FlagReasonCard";
import { SignalVerdict } from "@/components/console/SignalVerdict";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

/** The final verdict, the flag reason, and the component scores. */
export function FinalResult({ result }: { result: GetResultResponse }) {
  return (
    <>
      <Card className="border-neutral-800 bg-neutral-900 text-neutral-100">
        <CardContent className="flex flex-col items-center gap-6 py-6 sm:flex-row sm:justify-around">
          <SignalVerdict signal={result.signal} />
          <ConfidenceGauge
            confidence={result.confidence}
            decisionThreshold={result.thresholds.decision}
          />
        </CardContent>
      </Card>

      <FlagReasonCard flagReason={result.flag_reason} />

      <Separator className="bg-neutral-800" />

      <Card className="border-neutral-800 bg-neutral-900 text-neutral-100">
        <CardHeader>
          <CardTitle className="text-base">Component scores</CardTitle>
        </CardHeader>
        <CardContent>
          <ComponentScorePanel result={result} />
        </CardContent>
      </Card>
    </>
  );
}
