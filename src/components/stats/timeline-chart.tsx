"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface Props {
  data: { week: string; count: number }[];
}

function formatWeek(weekStr: string): string {
  // weekStr is "YYYY-WW"
  const [year, week] = weekStr.split("-");
  const date = new Date(Number(year), 0, 1 + (Number(week) - 1) * 7);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function TimelineChart({ data }: Props) {
  if (data.length === 0) return null;

  const formatted = data.map((d) => ({
    label: formatWeek(d.week),
    count: d.count,
    rawWeek: d.week,
  }));

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={formatted}
          margin={{ top: 5, right: 10, left: -20, bottom: 5 }}
        >
          <defs>
            <linearGradient id="teaGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#b45309" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#b45309" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: "#a8a29e" }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "#a8a29e" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const d = payload[0].payload;
                return (
                  <div className="bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm shadow">
                    <p className="font-medium">Week of {d.label}</p>
                    <p className="text-stone-500">{d.count} session{d.count !== 1 ? "s" : ""}</p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Area
            type="monotone"
            dataKey="count"
            stroke="#b45309"
            strokeWidth={2}
            fill="url(#teaGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
