'use client';
import { Button } from '../Button';

// Estado "error" (§C-14.1: tarjeta con reintento). El `message` ya viene mapeado (i18n, §C-14.2).
export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
    >
      <p>{message}</p>
      {onRetry ? (
        <Button variant="secondary" className="mt-3" onClick={onRetry}>
          Reintentar
        </Button>
      ) : null}
    </div>
  );
}
