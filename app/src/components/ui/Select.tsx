import { CaretDown } from "@phosphor-icons/react";
import type { SelectHTMLAttributes } from "react";

export function Select({
  label,
  children,
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <span className="text-xs font-medium uppercase tracking-wider text-muted">
          {label}
        </span>
      )}
      <span className="relative inline-flex">
        <select
          className="w-full appearance-none rounded-lg border border-border bg-surface px-3 py-2 pr-8 text-sm text-ink-soft outline-none transition-colors focus:border-ink"
          {...props}
        >
          {children}
        </select>
        <CaretDown
          size={12}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
        />
      </span>
    </label>
  );
}
