import { ArrowDown, ArrowUp } from "@phosphor-icons/react";

export function KpiCard({
  label,
  value,
  delta,
  suffix,
  index = 0,
}: {
  label: string;
  value: string;
  delta?: number;
  suffix?: string;
  index?: number;
}) {
  const hasDelta = typeof delta === "number" && isFinite(delta);
  const isUp = hasDelta && delta! >= 0;

  return (
    <div
      className="fade-up rounded-xl border border-border bg-surface p-6"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-muted">
        {label}
      </p>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="font-serif text-4xl tracking-tight text-ink">
          {value}
        </span>
        {suffix && <span className="text-lg text-muted">{suffix}</span>}
      </div>
      {hasDelta && (
        <div
          className={`mt-3 inline-flex items-center gap-1 text-xs font-medium ${
            isUp ? "text-pale-green-ink" : "text-pale-red-ink"
          }`}
        >
          {isUp ? (
            <ArrowUp size={12} weight="bold" />
          ) : (
            <ArrowDown size={12} weight="bold" />
          )}
          {Math.abs(delta!).toFixed(1)}% so với kỳ trước
        </div>
      )}
    </div>
  );
}
