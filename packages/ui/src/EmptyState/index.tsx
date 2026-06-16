import type { ReactNode } from 'react';

// Estado "vacío" (§C-14.1: con CTA).
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-700">
      <p className="font-medium">{title}</p>
      {description ? <p className="mt-1 text-sm text-neutral-500">{description}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
