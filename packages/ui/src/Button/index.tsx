'use client';
import type { ButtonHTMLAttributes } from 'react';

// SPEC §C-5.2 / INV-10 (mobile-first).
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-deep text-white hover:opacity-90',
  secondary: 'bg-neutral-200 text-neutral-900 hover:bg-neutral-300 dark:bg-neutral-800 dark:text-neutral-100',
  ghost: 'bg-transparent text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};

export function Button({ variant = 'primary', className = '', ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-base font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT[variant]} ${className}`}
      {...props}
    />
  );
}
