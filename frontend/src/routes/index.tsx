import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

function IndexPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <p className="text-lg">
        Sapien launcher — built out in Milestone 1.
      </p>
    </div>
  );
}
