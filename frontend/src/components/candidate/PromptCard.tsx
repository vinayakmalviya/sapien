import type { Prompt } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Shows the instruction and the expected word.
 *
 * Reads `prompt.of` for the total, and `prompt.instruction` and
 * `prompt.expected_word` for display text only. This component never reads
 * `instruction` to decide any logic — that rule belongs to the scorer
 * registry, not here. Section 13 of frontend-handoff.md.
 */
export function PromptCard({ prompt }: { prompt: Prompt }) {
  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardDescription>
          Question {prompt.index} of {prompt.of}
        </CardDescription>
        <CardTitle className="text-lg font-normal">
          {prompt.instruction}
        </CardTitle>
      </CardHeader>
      {prompt.expected_word ? (
        <CardContent>
          <Badge variant="secondary">Say: "{prompt.expected_word}"</Badge>
        </CardContent>
      ) : null}
    </Card>
  );
}
