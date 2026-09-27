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
import { Switch } from "@/components/ui/switch";
import { storeSessionBootstrap } from "@/lib/sessionBootstrap";

export const Route = createFileRoute("/")({
  component: LauncherPage,
});

/**
 * Trigger the camera and microphone permission prompt here, on the
 * launcher, before the candidate's session starts. Section 12 of
 * frontend-handoff.md: "Request the permission on the launcher screen. Do
 * not request the permission during the demo." A granted permission is
 * remembered for the whole browser profile, so the candidate window opened
 * next does not prompt again.
 */
async function primeCameraPermission() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    stream.getTracks().forEach((track) => track.stop());
  } catch {
    // Ignore. The candidate surface's own PermissionGate asks again.
  }
}

function LauncherPage() {
  const navigate = useNavigate();
  const startSession = useStartSession();
  const [candidateId, setCandidateId] = useState("demo-candidate-1");
  const [useSyntheticClip, setUseSyntheticClip] = useState(false);

  async function handleStart() {
    const [result] = await Promise.all([
      startSession.mutateAsync({ candidate_id: candidateId }),
      // A file source needs no camera permission — skip priming for it.
      useSyntheticClip ? Promise.resolve() : primeCameraPermission(),
    ]);

    // The candidate window has no other way to learn prompt 1. Both
    // windows share one browser, on one machine. localStorage is the
    // bridge. See src/lib/sessionBootstrap.ts.
    storeSessionBootstrap(result.session_id, {
      totalPrompts: result.total_prompts,
      enabledModules: result.enabled_modules,
      firstPrompt: result.prompt,
    });

    // The interview surface opens in its own window. The console stays in
    // the current window. Section 5 of frontend-handoff.md: no join code,
    // no QR code — a link is enough, both surfaces run on one machine.
    // Milestone 6: ?source=file plays the prepared MP4 clip instead of the
    // webcam — the synthetic-candidate demo path.
    const interviewUrl = useSyntheticClip
      ? `/interview/${result.session_id}?source=file`
      : `/interview/${result.session_id}`;
    window.open(interviewUrl, "_blank");
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
            <div className="flex items-center justify-between rounded-lg border border-neutral-800 px-3 py-2.5">
              <div className="flex flex-col">
                <Label htmlFor="synthetic-clip" className="text-neutral-200">
                  Use synthetic candidate clip
                </Label>
                <span className="text-xs text-neutral-500">
                  Plays a prepared MP4 instead of the webcam
                </span>
              </div>
              <Switch
                id="synthetic-clip"
                checked={useSyntheticClip}
                onCheckedChange={setUseSyntheticClip}
              />
            </div>
            <Button
              size="lg"
              onClick={handleStart}
              disabled={startSession.isPending}
            >
              {startSession.isPending ? "Starting…" : "Start session"}
            </Button>
            {startSession.isError ? (
              <p className="text-sm text-red-400">
                {startSession.error.message}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </ConsoleShell>
  );
}
