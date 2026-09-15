import { ArrowDown } from "@phosphor-icons/react";
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
    <div className="flex flex-col items-stretch gap-0">
      {stages.map((stage, i) => {
        const ratio = stage.value / max;
        const widthPct = max === 0 ? 20 : 20 + 80 * Math.sqrt(ratio);
        const prev = i > 0 ? stages[i - 1].value : null;
        const conv = prev ? (stage.value / prev) * 100 : null;

        return (
          <div key={stage.label}>
            {i > 0 && (
              <div className="flex items-center justify-center gap-2 py-2 text-xs text-muted">
                <ArrowDown size={14} />
                <span className="font-medium text-ink-soft">
                  {conv !== null ? formatPercent(conv) : "—"}
                </span>
                <span>chuyển đổi</span>
              </div>
            )}
            <div className="flex flex-col items-center">
              <div
                className={`fade-up flex h-16 items-center justify-center rounded-lg text-white transition-[width] duration-500 ${toneBar[stage.tone]}`}
                style={{ width: `${widthPct}%`, animationDelay: `${i * 120}ms` }}
              >
                <span className="font-serif text-2xl tabular-nums">
                  {formatNumber(stage.value)}
                </span>
              </div>
              <span className="mt-2 text-xs font-medium uppercase tracking-wider text-muted">
                {stage.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
