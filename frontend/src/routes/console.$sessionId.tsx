import { Link, createFileRoute } from "@tanstack/react-router";
import { useSessionStatus } from "@/api/queries";
import { ComponentScorePanel } from "@/components/console/ComponentScorePanel";
import { ConfidenceGauge } from "@/components/console/ConfidenceGauge";
import { ConsoleShell } from "@/components/console/ConsoleShell";
import { FlagReasonCard } from "@/components/console/FlagReasonCard";
import { LatencyBadge } from "@/components/console/LatencyBadge";
import { ScoringState } from "@/components/console/ScoringState";
import { SessionTimeline } from "@/components/console/SessionTimeline";
import { SignalVerdict } from "@/components/console/SignalVerdict";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/console/$sessionId")({
  component: ConsolePage,
});

function ConsolePage() {
  const { sessionId } = Route.useParams();
  const statusQuery = useSessionStatus(sessionId);
  const data = statusQuery.data;
  const lastCompleted = data?.completed_prompts.at(-1) ?? null;

  return (
    <ConsoleShell sessionId={sessionId}>
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Live session</h1>
          <Link
            to="/console/$sessionId/settings"
            params={{ sessionId }}
            className="text-base text-neutral-400 underline-offset-4 hover:text-brand hover:underline"
          >
            Module settings
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {data ? (
            <Badge
              variant="outline"
              className="border-neutral-700 text-neutral-200"
            >
              {data.status}
            </Badge>
          ) : null}
          {lastCompleted ? (
            <LatencyBadge latencyMs={lastCompleted.latency_ms} />
          ) : null}
        </div>

        {statusQuery.isLoading ? (
          <p className="text-base text-neutral-500">Connecting…</p>
        ) : null}
        {statusQuery.isError ? (
          <p className="text-base text-red-400">{statusQuery.error.message}</p>
        ) : null}

        {data ? (
          <>
            <SessionTimeline
              totalPrompts={data.total_prompts}
              currentPromptIndex={data.current_prompt_index}
              completedPrompts={data.completed_prompts}
              status={data.status}
              enabledModules={data.enabled_modules}
            />

            {data.status === "scoring" ? <ScoringState /> : null}

            {data.result ? (
              <>
                <Card className="border-neutral-800 bg-neutral-900 text-neutral-100">
                  <CardContent className="flex flex-col items-center gap-6 py-6 sm:flex-row sm:justify-around">
                    <SignalVerdict signal={data.result.signal} />
                    <ConfidenceGauge
                      confidence={data.result.confidence}
                      decisionThreshold={data.result.thresholds.decision}
                    />
                  </CardContent>
                </Card>

                <FlagReasonCard flagReason={data.result.flag_reason} />

                <Separator className="bg-neutral-800" />

                <Card className="border-neutral-800 bg-neutral-900 text-neutral-100">
                  <CardHeader>
                    <CardTitle className="text-base">
                      Component scores
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ComponentScorePanel result={data.result} />
                  </CardContent>
                </Card>
              </>
            ) : null}
          </>
        ) : null}
      </div>
    </ConsoleShell>
  );
}
