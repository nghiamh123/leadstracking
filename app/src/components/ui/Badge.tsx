import type { ReactNode } from "react";

type Tone = "red" | "blue" | "green" | "yellow" | "ink" | "neutral";

const toneClasses: Record<Tone, string> = {
  red: "bg-pale-red text-pale-red-ink",
  blue: "bg-pale-blue text-pale-blue-ink",
  green: "bg-pale-green text-pale-green-ink",
  yellow: "bg-pale-yellow text-pale-yellow-ink",
  ink: "bg-ink text-white",
  neutral: "bg-surface-alt text-muted",
};

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
