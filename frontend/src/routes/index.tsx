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
import { SapienIcon } from "@/components/console/SapienIcon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Scenario } from "@/api/types";
import { DEFAULT_SCENARIO, isScenario, SCENARIOS } from "@/lib/scenarios";
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

function buildCandidateUrl(
  sessionId: string,
  scenario: Scenario,
  useSyntheticClip: boolean,
) {
  const route = scenario === "video_call" ? "call" : "interview";
  const url = `/${route}/${sessionId}`;
  return useSyntheticClip ? `${url}?source=file` : url;
}

const SCENARIO_ITEMS = SCENARIOS.map((scenario) => ({
  value: scenario.id,
  label: scenario.label,
}));

function LauncherPage() {
  const navigate = useNavigate();
  const startSession = useStartSession();
  const [candidateId, setCandidateId] = useState("demo-candidate-1");
  const [scenario, setScenario] = useState<Scenario>(DEFAULT_SCENARIO);
  const [useSyntheticClip, setUseSyntheticClip] = useState(false);
  const selectedScenario = SCENARIOS.find((item) => item.id === scenario);

  async function handleStart() {
    // Must open before the first await, or the browser blocks it as a popup.
    const candidateWindow = window.open("about:blank", "_blank");
    const [result] = await Promise.all([
      startSession.mutateAsync({
        candidate_id: candidateId,
        scenario,
        enabled_modules: { liveness: true, frame: true, voice: true },
      }),
      useSyntheticClip ? Promise.resolve() : primeCameraPermission(),
    ]).catch((error) => {
      candidateWindow?.close();
      throw error;
    });

    // The candidate window has no other way to learn prompt 1. Both
    // windows share one browser, on one machine. localStorage is the
    // bridge. See src/lib/sessionBootstrap.ts.
    // A backend from before ui-contract.md Revision 2 omits `scenario`.
    const sessionScenario = result.scenario ?? scenario;
    storeSessionBootstrap(result.session_id, {
      scenario: sessionScenario,
      totalPrompts: result.total_prompts,
      enabledModules: result.enabled_modules,
      firstPrompt: result.prompt,
    });

    const candidateUrl = buildCandidateUrl(
      result.session_id,
      sessionScenario,
      useSyntheticClip,
    );
    if (candidateWindow) {
      candidateWindow.location.href = candidateUrl;
    } else {
      window.open(candidateUrl, "_blank");
    }
    navigate({ to: "/console/$sessionId", params: { sessionId: result.session_id } });
  }

  return (
    <ConsoleShell>
      <div className="flex min-h-[80vh] items-center justify-center">
        <Card className="w-full max-w-md border-neutral-800 bg-neutral-900 text-neutral-100">
          <CardHeader>
            <div className="mb-2">
              <SapienIcon className="h-12" />
            </div>
            <CardTitle className="text-xl">Start a session</CardTitle>
            <CardDescription className="text-neutral-400">
              Opens the candidate window and the operator console for one
              session.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="scenario" className="text-neutral-300">
                Scenario
              </Label>
              <Select
                items={SCENARIO_ITEMS}
                value={scenario}
                onValueChange={(value) => {
                  if (isScenario(value)) setScenario(value);
                }}
              >
                <SelectTrigger
                  id="scenario"
                  className="w-full border-neutral-700 bg-neutral-950 text-neutral-100"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="dark">
                  {SCENARIOS.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-neutral-500">
                {selectedScenario?.description}
              </p>
            </div>
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
                Audio authenticity, frame classification, and liveness scoring
                run against the live FastAPI backend.
              </p>
            </div>
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor="synthetic-clip" className="text-neutral-300">
                  Use synthetic candidate clip
                </Label>
                <p className="text-xs text-neutral-500">
                  Plays a prepared MP4 instead of the webcam
                </p>
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
