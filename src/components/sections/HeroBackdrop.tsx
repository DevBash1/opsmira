export function HeroBackdrop() {
  return (
    <div className="absolute top-0 left-1/2 z-0 h-[1300px] w-[1440px] -translate-x-1/2 overflow-hidden">
      <div className="absolute top-[-120px] left-[220px] z-0 h-[760px] w-[1000px] rounded-full bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,var(--glow)_0%,#00000000_100%)] motion-safe:animate-[glow-drift_19s_ease-in-out_infinite]" />
      <div className="absolute top-[420px] left-[900px] z-[1] h-[700px] w-[800px] rounded-full bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,var(--glow-2)_0%,#00000000_100%)] motion-safe:animate-[glow-drift_24s_ease-in-out_infinite] motion-safe:[animation-delay:-9s]" />
      <div className="absolute top-[-420px] left-[-30px] z-[2] h-[1500px] w-[1500px] rounded-full border-[3.75px] border-[var(--line)] opacity-70 motion-safe:animate-[ring-breathe_16s_ease-in-out_infinite]" />
      <div className="absolute top-[-210px] left-[180px] z-[3] h-[1080px] w-[1080px] rounded-full border-[3.75px] border-[var(--line)] opacity-70 motion-safe:animate-[ring-breathe_20s_ease-in-out_infinite] motion-safe:[animation-delay:-6s]" />
      <div className="absolute top-[-20px] left-[370px] z-[4] h-[700px] w-[700px] rounded-full border-[3.5px] border-[var(--line)] opacity-70 motion-safe:animate-[ring-breathe_24s_ease-in-out_infinite] motion-safe:[animation-delay:-12s]" />
      <div className="dot-float-1 absolute top-[65.11px] left-[1187.895px] z-[5] h-[12px] w-[12px] rounded-full bg-[var(--accent)] [box-shadow:0px_0px_14px_var(--accent)]" />
      <div className="dot-float-2 absolute top-[446.014px] left-[387.22px] z-[6] h-[8px] w-[8px] rounded-full bg-[var(--accent-2)] [box-shadow:0px_0px_10px_var(--accent-2)]" />
    </div>
  );
}
