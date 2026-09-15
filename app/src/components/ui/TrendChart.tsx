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
          yAxisId="clicks"
          tick={{ fontSize: 11, fill: "#787774" }}
          axisLine={false}
          tickLine={false}
          width={44}
          tickFormatter={(v) => formatNumber(v)}
        />
        <YAxis
          yAxisId="count"
          orientation="right"
          tick={{ fontSize: 11, fill: "#787774" }}
          axisLine={false}
          tickLine={false}
          width={36}
        />
        <Tooltip
          contentStyle={{
            border: "1px solid #EAEAEA",
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
          type="monotone"
          dataKey="clicks"
          name="Traffic (click)"
          stroke="#111111"
          strokeWidth={2}
          dot={false}
        />
        <Line
          yAxisId="count"
          type="monotone"
          dataKey="leads"
          name="Lead"
          stroke="#1F6C9F"
          strokeWidth={2}
          dot={false}
        />
        <Line
          yAxisId="count"
          type="monotone"
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
