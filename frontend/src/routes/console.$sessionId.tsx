import { Link, createFileRoute } from "@tanstack/react-router";
import { useSessionStatus } from "@/api/queries";
import { CallConsole } from "@/components/console/CallConsole";
import { ConsoleShell } from "@/components/console/ConsoleShell";
import { InterviewConsole } from "@/components/console/InterviewConsole";
import { LatencyBadge } from "@/components/console/LatencyBadge";
import { Badge } from "@/components/ui/badge";
import { SCENARIO_LABELS } from "@/lib/scenarios";

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
          {data?.scenario ? (
            <Badge
              variant="outline"
              className="border-neutral-700 text-neutral-200"
            >
              {SCENARIO_LABELS[data.scenario]}
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
          data.scenario === "video_call" ? (
            <CallConsole sessionId={sessionId} data={data} />
          ) : (
            <InterviewConsole data={data} />
          )
        ) : null}
      </div>
    </ConsoleShell>
  );
}
