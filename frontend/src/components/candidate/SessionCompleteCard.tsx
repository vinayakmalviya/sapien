import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Thanks the candidate. Shows no score.
 *
 * Section 10.1 and Section 13 of frontend-handoff.md: the candidate must
 * never learn the verdict. This component must never be given a score,
 * a signal, or a flag reason as a prop — there is deliberately no way to
 * pass one in.
 */
export function SessionCompleteCard() {
  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle className="text-lg font-normal">Thank you</CardTitle>
      </CardHeader>
      <CardContent className="text-base text-slate-600">
        Your interview is complete. You may close this window.
      </CardContent>
    </Card>
  );
}
