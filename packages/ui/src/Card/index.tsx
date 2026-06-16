import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900 ${className}`}>
      {children}
    </div>
  );
}
