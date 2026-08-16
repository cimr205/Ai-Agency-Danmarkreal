import { useEffect, useState } from "react";

/** Quiet bottom-corner heartbeat: no toast spam, just a subtle "alive" signal. */
export function AmbientPresence() {
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    const t = setInterval(() => {
      setPulse(true);
      setTimeout(() => setPulse(false), 800);
    }, 6000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-3 left-3 z-30 hidden md:flex items-center gap-2 text-[10px] font-mono text-muted-foreground/40">
      <span className="relative inline-flex h-1.5 w-1.5">
        <span className={`absolute inline-flex h-full w-full rounded-full bg-emerald-500/60 ${pulse ? "animate-ping" : ""}`} />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
      </span>
      <span className="tracking-[0.1em] uppercase">live</span>
    </div>
  );
}
