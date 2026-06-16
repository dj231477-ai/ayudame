// Web Worker de timer (SPEC §C-22 Fase 1: "Timer (Web Worker)").
// Emite un 'tick' por segundo sin verse afectado por el throttling de pestañas en segundo plano.
let interval = null;
self.onmessage = (e) => {
  if (e.data === 'start') {
    if (interval) clearInterval(interval);
    interval = setInterval(() => self.postMessage('tick'), 1000);
  } else if (e.data === 'stop') {
    if (interval) clearInterval(interval);
    interval = null;
  }
};
