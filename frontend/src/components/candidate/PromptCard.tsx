import type { Prompt } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
        <CardContent className="flex flex-col items-start gap-2">
          <Badge variant="secondary">Say: "{prompt.expected_word}"</Badge>
          <p className="text-sm text-slate-500">
            Speak the complete phrase clearly before the timer ends.
          </p>
        </CardContent>
      ) : null}
    </Card>
  );
}
