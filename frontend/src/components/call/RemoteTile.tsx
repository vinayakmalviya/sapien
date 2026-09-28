import { FAKE_INTERVIEWER_NAME, initialsOf } from "@/lib/fakeCompany";

/** The large tile: the host. There is no real remote participant. */
export function RemoteTile() {
  return (
    <div className="relative flex h-full w-full items-center justify-center rounded-xl bg-neutral-800">
      <div className="flex size-32 items-center justify-center rounded-full bg-primary text-4xl font-semibold text-primary-foreground">
        {initialsOf(FAKE_INTERVIEWER_NAME)}
      </div>
      <p className="absolute bottom-3 left-3 rounded-md bg-black/50 px-2 py-1 text-sm">
        {FAKE_INTERVIEWER_NAME} (Host)
      </p>
    </div>
  );
}
