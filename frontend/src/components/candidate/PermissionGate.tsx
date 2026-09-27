import type { ReactNode } from "react";
import type { MediaStreamStatus } from "@/capture/useMediaStream";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Shows the camera permission state. Renders its children only once the
 * state is `granted`. Section 10.1 of frontend-handoff.md.
 */
export function PermissionGate({
  status,
  error,
  children,
}: {
  status: MediaStreamStatus;
  error: string | null;
  children: ReactNode;
}) {
  if (status === "granted") {
    return <>{children}</>;
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>
          {status === "denied"
            ? "Camera access denied"
            : "Requesting camera access…"}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-slate-600">
        {status === "denied"
          ? (error ??
            "Allow camera and microphone access in your browser, then reload this page.")
          : "Check your browser for a permission prompt."}
      </CardContent>
    </Card>
  );
}
