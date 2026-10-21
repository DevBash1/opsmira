export type AuroraMood = "idle" | "thinking" | "working" | "approval" | "error";

/** The console's living background: slow liquid light that brightens while the agent works. */
export function Aurora({ mood }: { mood: AuroraMood }) {
  return (
    <div className="aurora z-0" data-mood={mood} aria-hidden="true">
      <div className="aurora-field">
        <div className="aurora-blob aurora-b1" />
        <div className="aurora-blob aurora-b2" />
        <div className="aurora-blob aurora-b3" />
        <div className="aurora-blob aurora-b4" />
      </div>
      <div className="aurora-energy" />
      <div className="aurora-veil" />
      <div className="aurora-grain" />
    </div>
  );
}
