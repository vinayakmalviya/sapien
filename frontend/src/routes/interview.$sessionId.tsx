import { createFileRoute } from "@tanstack/react-router";
import { CandidateShell } from "@/components/candidate/CandidateShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/interview/$sessionId")({
  component: InterviewPage,
});

function InterviewPage() {
  const { sessionId } = Route.useParams();

  return (
    <CandidateShell>
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Preparing your interview</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-slate-600">
          <p>Session ready. The camera and prompts arrive in Milestone 2.</p>
          <p className="font-mono text-xs text-slate-400">
            session: {sessionId}
          </p>
        </CardContent>
      </Card>
    </CandidateShell>
  );
}
