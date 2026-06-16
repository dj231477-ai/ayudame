// Estado "cargando" (§C-14.1: skeleton, no spinner genérico).
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-neutral-200 dark:bg-neutral-800 ${className}`}
      aria-hidden="true"
    />
  );
}
