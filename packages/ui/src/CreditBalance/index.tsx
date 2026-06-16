// Muestra saldo en créditos (1 crédito = $0.01) y su equivalente en USD. SPEC §C-9.3.
export function CreditBalance({ credits, balanceUsd }: { credits: number; balanceUsd: number }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-neutral-500">Saldo</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{credits}</p>
      <p className="text-xs text-neutral-500">créditos (${balanceUsd.toFixed(2)})</p>
    </div>
  );
}
