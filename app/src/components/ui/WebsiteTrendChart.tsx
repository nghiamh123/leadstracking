import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDateShort, formatNumber } from "../../lib/format";
import type { WebsiteTrendPoint } from "../../lib/api";

const COLORS = [
  "#111111",
  "#1F6C9F",
  "#346538",
  "#B45309",
  "#7C3AED",
  "#DB2777",
  "#0891B2",
  "#CA8A04",
  "#DC2626",
  "#059669",
  "#4338CA",
  "#9333EA",
];

export function WebsiteTrendChart({
  websites,
  data,
}: {
  websites: { id: string; name: string }[];
  data: WebsiteTrendPoint[];
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {websites.map((w, i) => {
          const isHidden = hidden.has(w.id);
          const color = COLORS[i % COLORS.length];
          return (
            <button
              key={w.id}
              onClick={() => toggle(w.id)}
              className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-opacity"
              style={{ borderColor: isHidden ? "#EAEAEA" : color, opacity: isHidden ? 0.4 : 1 }}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              {w.name}
            </button>
          );
        })}
      </div>

      <ResponsiveContainer width="100%" height={360}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="#EAEAEA" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={formatDateShort}
            tick={{ fontSize: 11, fill: "#787774" }}
            axisLine={{ stroke: "#EAEAEA" }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#787774" }}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={(v) => formatNumber(v)}
          />
          <Tooltip
            contentStyle={{
              border: "1px solid #EAEAEA",
              borderRadius: 8,
              fontSize: 12,
              boxShadow: "none",
            }}
            labelFormatter={(v) => formatDateShort(String(v))}
            formatter={(value) => formatNumber(Number(value))}
          />
          {websites
            .filter((w) => !hidden.has(w.id))
            .map((w) => {
              const colorIndex = websites.findIndex((x) => x.id === w.id);
              return (
                <Line
                  key={w.id}
                  type="monotone"
                  dataKey={w.id}
                  name={w.name}
                  stroke={COLORS[colorIndex % COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                />
              );
            })}
        </LineChart>
      </ResponsiveContainer>

      {data.length === 0 && <p className="text-center text-sm text-muted">Không có dữ liệu.</p>}
    </div>
  );
}
