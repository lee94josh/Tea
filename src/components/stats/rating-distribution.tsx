"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface Props {
  data: { rating: number; count: number }[];
}

const COLORS = [
  "#d1d5db", // 1 star
  "#fcd34d", // 2 stars
  "#fbbf24", // 3 stars
  "#f59e0b", // 4 stars
  "#b45309", // 5 stars
];

export function RatingDistribution({ data }: Props) {
  // Fill in missing ratings
  const filled = [1, 2, 3, 4, 5].map((r) => ({
    rating: r,
    count: data.find((d) => d.rating === r)?.count ?? 0,
    label: "★".repeat(r),
  }));

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={filled} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fill: "#78716c" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11, fill: "#a8a29e" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "#f5f5f4" }}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const d = payload[0].payload;
                return (
                  <div className="bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm shadow">
                    <p className="font-medium">{d.label}</p>
                    <p className="text-stone-500">{d.count} session{d.count !== 1 ? "s" : ""}</p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Bar dataKey="count" radius={[6, 6, 0, 0]}>
            {filled.map((entry, index) => (
              <Cell key={entry.rating} fill={COLORS[index]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
