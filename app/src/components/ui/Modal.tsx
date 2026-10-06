import { X } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} />
      <div
        className={`fade-up relative max-h-[90vh] w-full overflow-y-auto rounded-t-xl border border-border bg-surface p-6 sm:rounded-xl ${
          wide ? "max-w-2xl" : "max-w-md"
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-serif text-lg text-ink">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-muted hover:bg-surface-alt"
            aria-label="Đóng"
          >
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
