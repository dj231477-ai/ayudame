'use client';
import { useEffect, useRef, useState } from 'react';

// Cuenta atrás hasta end_time del bloque, accionada por un Web Worker (SPEC §C-22 Fase 1).
// Fallback a setInterval si Worker no está disponible.
export function useBlockTimer(date: string, endTime: string | null): number {
  const [remaining, setRemaining] = useState(0);
  const targetRef = useRef<number>(0);

  useEffect(() => {
    if (!endTime) {
      setRemaining(0);
      return;
    }
    targetRef.current = new Date(`${date}T${endTime}`).getTime();
    const compute = () =>
      setRemaining(Math.max(0, Math.round((targetRef.current - Date.now()) / 1000)));
    compute();

    let worker: Worker | null = null;
    let fallback: ReturnType<typeof setInterval> | null = null;

    try {
      worker = new Worker('/timer-worker.js');
      worker.onmessage = compute;
      worker.postMessage('start');
    } catch {
      fallback = setInterval(compute, 1000);
    }

    return () => {
      if (worker) {
        worker.postMessage('stop');
        worker.terminate();
      }
      if (fallback) clearInterval(fallback);
    };
  }, [date, endTime]);

  return remaining;
}
