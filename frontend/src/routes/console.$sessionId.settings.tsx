import { Link, createFileRoute } from "@tanstack/react-router";
import { ConsoleShell } from "@/components/console/ConsoleShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/console/$sessionId/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { sessionId } = Route.useParams();

  return (
    <ConsoleShell sessionId={sessionId}>
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <Link
          to="/console/$sessionId"
          params={{ sessionId }}
          className="text-sm text-neutral-400 hover:text-brand"
        >
          ← Back to console
        </Link>
        <Card className="border-neutral-800 bg-neutral-900 text-neutral-100">
          <CardHeader>
            <CardTitle>Module toggles</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-neutral-400">
            <p>
              Optional. `ModuleToggleRow` and the enabled-modules wiring
              arrive in Milestone 7.
            </p>
          </CardContent>
        </Card>
      </div>
    </ConsoleShell>
  );
}
