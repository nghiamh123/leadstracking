import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDateShort, formatNumber } from "../../lib/format";

export interface TrendPoint {
  date: string;
  clicks: number;
  leads: number;
  orders: number;
}

export function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#E3E6EF" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDateShort}
          tick={{ fontSize: 11, fill: "#6B7390" }}
          axisLine={{ stroke: "#E3E6EF" }}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          yAxisId="clicks"
          tick={{ fontSize: 11, fill: "#6B7390" }}
          axisLine={false}
          tickLine={false}
          width={44}
          tickFormatter={(v) => formatNumber(v)}
        />
        <YAxis
          yAxisId="count"
          orientation="right"
          tick={{ fontSize: 11, fill: "#6B7390" }}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <Tooltip
          contentStyle={{
            border: "1px solid #E3E6EF",
            borderRadius: 8,
            fontSize: 12,
            boxShadow: "none",
          }}
          labelFormatter={(v) => formatDateShort(String(v))}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
          iconType="circle"
          iconSize={8}
        />
        <Line
          yAxisId="clicks"
          type="linear"
          dataKey="clicks"
          name="Traffic (click)"
          stroke="#1B2858"
          strokeWidth={2}
          dot={false}
        />
        <Line
          yAxisId="count"
          type="linear"
          dataKey="leads"
          name="Lead"
          stroke="#EB7A28"
          strokeWidth={2}
          dot={false}
        />
        <Line
          yAxisId="count"
          type="linear"
          dataKey="orders"
          name="Đơn hàng"
          stroke="#346538"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
