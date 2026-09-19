import { ArrowRight } from "@phosphor-icons/react";
import { formatNumber, formatPercent } from "../../lib/format";

interface FunnelStage {
  label: string;
  value: number;
  tone: "ink" | "blue" | "green";
}

const toneBar: Record<FunnelStage["tone"], string> = {
  ink: "bg-ink",
  blue: "bg-pale-blue-ink",
  green: "bg-pale-green-ink",
};

export function FunnelChart({ stages }: { stages: FunnelStage[] }) {
  const max = Math.max(...stages.map((s) => s.value), 1);

  return (
    <div className="flex flex-col items-stretch gap-6 sm:flex-row sm:items-start">
      {stages.map((stage, i) => {
        const ratio = stage.value / max;
        const barWidthPct = max === 0 ? 6 : 6 + 94 * Math.sqrt(ratio);
        const prev = i > 0 ? stages[i - 1].value : null;
        const conv = prev ? (stage.value / prev) * 100 : null;

        return (
          <div key={stage.label} className="flex flex-1 items-start gap-4">
            {i > 0 && (
              <div className="hidden flex-col items-center gap-1 pt-1 text-muted sm:flex">
                <ArrowRight size={14} />
                <span className="whitespace-nowrap text-[11px] font-medium text-ink-soft">
                  {conv !== null ? formatPercent(conv) : "—"}
                </span>
              </div>
            )}
            <div
              className="fade-up flex flex-1 flex-col gap-2"
              style={{ animationDelay: `${i * 120}ms` }}
            >
              <span className="whitespace-nowrap text-xs font-medium uppercase tracking-wider text-muted">
                {stage.label}
              </span>
              <span className="font-serif text-3xl tabular-nums text-ink">
                {formatNumber(stage.value)}
              </span>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-alt">
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ${toneBar[stage.tone]}`}
                  style={{ width: `${barWidthPct}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
