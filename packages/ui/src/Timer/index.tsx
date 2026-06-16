'use client';

// Display de cuenta atrás (presentacional). La lógica vive en useBlockTimer (app). §C-13.3.
export function Timer({ remainingSeconds, label }: { remainingSeconds: number; label?: string }) {
  const safe = Math.max(0, Math.floor(remainingSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return (
    <div className="text-center">
      {label ? <p className="text-sm text-neutral-500">{label}</p> : null}
      <p className="font-mono text-5xl font-bold tabular-nums">
        {String(m).padStart(2, '0')}:{String(s).padStart(2, '0')}
      </p>
    </div>
  );
}
