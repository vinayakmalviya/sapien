import { createFileRoute } from "@tanstack/react-router";
import { CalibrationHint } from "@/components/candidate/CalibrationHint";
import { CameraFeed } from "@/components/candidate/CameraFeed";
import { CandidateShell } from "@/components/candidate/CandidateShell";
import { CountdownRing } from "@/components/candidate/CountdownRing";
import { LandmarkOverlay } from "@/components/candidate/LandmarkOverlay";
import { PermissionGate } from "@/components/candidate/PermissionGate";
import { PromptCard } from "@/components/candidate/PromptCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSessionRunner } from "@/session/useSessionRunner";

export const Route = createFileRoute("/interview/$sessionId")({
  component: InterviewPage,
});

function InterviewPage() {
  const { sessionId } = Route.useParams();
  const { state, mediaStream, videoRef, landmarker, start } =
    useSessionRunner(sessionId);

  if (state.status === "idle") {
    return (
      <CandidateShell>
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Ready to begin?</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm text-slate-600">
            <p>
              This interview uses your camera and microphone. Press Start
              when you are ready.
            </p>
            <Button size="lg" onClick={start}>
              Start interview
            </Button>
          </CardContent>
        </Card>
      </CandidateShell>
    );
  }

  if (state.status === "error") {
    return (
      <CandidateShell>
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Something went wrong</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            {state.errorMessage}
          </CardContent>
        </Card>
      </CandidateShell>
    );
  }

  if (state.status === "complete") {
    return (
      <CandidateShell>
        {/* SessionCompleteCard proper arrives in Milestone 6. Must never show a score. */}
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Thank you</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-600">
            Your interview is complete. You may close this window.
          </CardContent>
        </Card>
      </CandidateShell>
    );
  }

  return (
    <CandidateShell>
      <PermissionGate status={mediaStream.status} error={mediaStream.error}>
        <div className="flex w-full max-w-3xl flex-col items-center gap-6">
          <div className="relative">
            <CameraFeed videoRef={videoRef} stream={mediaStream.stream} />
            <LandmarkOverlay
              videoRef={videoRef}
              rawLandmarksRef={landmarker.rawLandmarksRef}
            />
            {state.status === "prompt_shown" || state.status === "recording" ? (
              <div className="absolute bottom-3 right-3 rounded-full bg-white/80 p-1">
                <CountdownRing
                  durationMs={state.currentPrompt?.duration_ms ?? 0}
                  isActive={state.status === "recording"}
                />
              </div>
            ) : null}
          </div>

          {state.status === "calibrating" ? (
            <CalibrationHint
              goodFrames={landmarker.snapshot.consecutiveGoodFrames}
            />
          ) : null}

          {state.currentPrompt &&
          (state.status === "prompt_shown" || state.status === "recording") ? (
            <PromptCard prompt={state.currentPrompt} />
          ) : null}

          {state.status === "uploading" ? (
            <p className="text-sm text-slate-500">Submitting…</p>
          ) : null}
        </div>
      </PermissionGate>
    </CandidateShell>
  );
}
