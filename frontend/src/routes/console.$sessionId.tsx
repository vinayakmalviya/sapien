import { Link, createFileRoute } from "@tanstack/react-router";
import { useSessionStatus } from "@/api/queries";
import { ConsoleShell } from "@/components/console/ConsoleShell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/console/$sessionId")({
  component: ConsolePage,
});

function ConsolePage() {
  const { sessionId } = Route.useParams();
  const statusQuery = useSessionStatus(sessionId);

  return (
    <ConsoleShell sessionId={sessionId}>
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Live session</h1>
          <Link
            to="/console/$sessionId/settings"
            params={{ sessionId }}
            className="text-sm text-neutral-400 underline-offset-4 hover:text-brand hover:underline"
          >
            Module settings
          </Link>
        </div>

        <Card className="border-neutral-800 bg-neutral-900 text-neutral-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-3 text-base">
              Status
              {statusQuery.data ? (
                <Badge variant="outline" className="border-neutral-700 text-neutral-200">
                  {statusQuery.data.status}
                </Badge>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm text-neutral-400">
            {statusQuery.isLoading ? <p>Connecting…</p> : null}
            {statusQuery.isError ? (
              <p className="text-verdict-synthetic">
                {statusQuery.error.message}
              </p>
            ) : null}
            {statusQuery.data ? (
              <>
                <p>
                  Prompt {statusQuery.data.current_prompt_index} of{" "}
                  {statusQuery.data.total_prompts}
                </p>
                <p>
                  {statusQuery.data.completed_prompts.length} prompt(s)
                  submitted so far.
                </p>
                <p className="text-xs text-neutral-500">
                  Full timeline, score bars, and verdict arrive in Milestones
                  5 and 6.
                </p>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </ConsoleShell>
  );
}
