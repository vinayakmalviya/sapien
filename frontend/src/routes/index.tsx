import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useStartSession } from "@/api/queries";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConsoleShell } from "@/components/console/ConsoleShell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  component: LauncherPage,
});

function LauncherPage() {
  const navigate = useNavigate();
  const startSession = useStartSession();
  const [candidateId, setCandidateId] = useState("demo-candidate-1");

  async function handleStart() {
    const result = await startSession.mutateAsync({ candidate_id: candidateId });
    // The interview surface opens in its own window. The console stays in
    // the current window. Section 5 of frontend-handoff.md: no join code,
    // no QR code — a link is enough, both surfaces run on one machine.
    window.open(`/interview/${result.session_id}`, "_blank");
    navigate({ to: "/console/$sessionId", params: { sessionId: result.session_id } });
  }

  return (
    <ConsoleShell>
      <div className="flex min-h-[80vh] items-center justify-center">
        <Card className="w-full max-w-md border-neutral-800 bg-neutral-900 text-neutral-100">
          <CardHeader>
            <CardTitle className="text-xl">Start a session</CardTitle>
            <CardDescription className="text-neutral-400">
              Opens the candidate window and the operator console for one
              session.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="candidate-id" className="text-neutral-300">
                Candidate label
              </Label>
              <Input
                id="candidate-id"
                value={candidateId}
                onChange={(event) => setCandidateId(event.target.value)}
                className="border-neutral-700 bg-neutral-950 text-neutral-100"
              />
              <p className="text-xs text-neutral-500">
                Mock mode: include &quot;synthetic&quot; in the label to demo
                the synthetic verdict path.
              </p>
            </div>
            <Button
              size="lg"
              onClick={handleStart}
              disabled={startSession.isPending}
            >
              {startSession.isPending ? "Starting…" : "Start session"}
            </Button>
            {startSession.isError ? (
              <p className="text-sm text-verdict-synthetic">
                {startSession.error.message}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </ConsoleShell>
  );
}
