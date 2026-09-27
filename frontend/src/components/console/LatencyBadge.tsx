import { Badge } from "@/components/ui/badge";

/** Shows the response time of the last API call. Section 10.2 of frontend-handoff.md. */
export function LatencyBadge({ latencyMs }: { latencyMs: number }) {
  return (
    <Badge variant="outline" className="border-neutral-700 text-neutral-300">
      last call {latencyMs}ms
    </Badge>
  );
}
