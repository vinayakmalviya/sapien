import { createFileRoute } from "@tanstack/react-router";
import { VideoOffIcon } from "lucide-react";
import { useState } from "react";
import { CallControls } from "@/components/call/CallControls";
import { CallEndedCard } from "@/components/call/CallEndedCard";
import { CallShell } from "@/components/call/CallShell";
import { HostRequestBanner } from "@/components/call/HostRequestBanner";
import { RemoteTile } from "@/components/call/RemoteTile";
import { SelfTile } from "@/components/call/SelfTile";
import { CameraFeed } from "@/components/candidate/CameraFeed";
import { Button } from "@/components/ui/button";
import { FAKE_INTERVIEWER_NAME, FAKE_MEETING_TITLE } from "@/lib/fakeCompany";
import { useSessionRunner } from "@/session/useSessionRunner";

interface CallSearch {
  /** ?source=file plays the prepared MP4 clip instead of the webcam. */
  source?: "webcam" | "file";
}

export const Route = createFileRoute("/call/$sessionId")({
  validateSearch: (search: Record<string, unknown>): CallSearch => ({
    source: search.source === "file" ? "file" : "webcam",
  }),
  component: CallPage,
});

/**
 * The video call candidate surface. Section 5.2 of video-call-scenario.md.
 * Shares the capture hooks and the session runner with the ATS interview.
 * No face mesh: a real conferencing product shows none.
 */
function CallPage() {
  const { sessionId } = Route.useParams();
  const { source } = Route.useSearch();
  const { state, presentation, videoSource, videoRef, start } =
    useSessionRunner(sessionId, source);
  const [joinedAt, setJoinedAt] = useState<number | null>(null);

  function handleJoin() {
    setJoinedAt(Date.now());
    start();
  }

  if (state.status === "idle") {
    return (
      <CallShell>
        <PreJoin onJoin={handleJoin} />
      </CallShell>
    );
  }

  if (state.status === "error") {
    return (
      <CallShell joinedAt={joinedAt}>
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="flex max-w-md flex-col gap-2 rounded-xl bg-neutral-900 px-8 py-8 ring-1 ring-neutral-800">
            <p className="text-lg font-semibold">
              You were disconnected from the call
            </p>
            <p className="text-sm text-neutral-400">{state.errorMessage}</p>
          </div>
        </div>
      </CallShell>
    );
  }

  if (state.status === "complete") {
    return (
      <CallShell>
        <CallEndedCard />
      </CallShell>
    );
  }

  const isJoining =
    state.status === "requesting_permission" || state.status === "calibrating";
  const showsBanner =
    presentation?.showsPrompt &&
    state.currentPrompt &&
    (state.status === "prompt_shown" || state.status === "recording");

  return (
    <CallShell joinedAt={joinedAt}>
      <div className="relative min-h-0 flex-1 p-4">
        <RemoteTile />
        {showsBanner && state.currentPrompt ? (
          <HostRequestBanner
            prompt={state.currentPrompt}
            isRecording={state.status === "recording"}
            message={state.errorMessage}
          />
        ) : null}
        <SelfTile overlay={isJoining ? "Joining…" : null}>
          <CameraFeed
            videoRef={videoRef}
            stream={videoSource.stream}
            fileUrl={videoSource.fileUrl}
            className="h-full w-full"
          />
        </SelfTile>
      </div>
      <CallControls />
    </CallShell>
  );
}

function PreJoin({ onJoin }: { onJoin: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center gap-10 p-6">
      <div className="flex aspect-[4/3] w-[420px] flex-col items-center justify-center gap-3 rounded-xl bg-neutral-800 text-neutral-400">
        <VideoOffIcon className="size-8" />
        <p className="text-sm">Your camera turns on when you join</p>
      </div>
      <div className="flex max-w-xs flex-col gap-4">
        <div>
          <p className="text-2xl font-semibold">Ready to join?</p>
          <p className="mt-1 text-sm text-neutral-400">{FAKE_MEETING_TITLE}</p>
          <p className="text-sm text-neutral-400">
            {FAKE_INTERVIEWER_NAME} is in this call
          </p>
        </div>
        <Button size="lg" onClick={onJoin} className="w-fit rounded-full px-6">
          Join now
        </Button>
      </div>
    </div>
  );
}
