"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { TEA_EDUCATION } from "@/lib/tea-education";
import type { TeaTypeKey } from "@/lib/tea-education";

interface Props {
  data: { type: string; sessionCount: number; avgRating: number }[];
}

const PIE_COLORS: Record<string, string> = {
  green: "#4ade80",
  black: "#92400e",
  white: "#d1d5db",
  oolong: "#fb923c",
  puerh: "#78716c",
  herbal: "#c084fc",
  yellow: "#fbbf24",
};

export function TypeBreakdown({ data }: Props) {
  if (data.length === 0) return null;

  const pieData = data.map((d) => ({
    name: TEA_EDUCATION[d.type as TeaTypeKey]?.displayName ?? d.type,
    value: d.sessionCount,
    avgRating: d.avgRating,
    type: d.type,
  }));

  return (
    <div>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
            >
              {pieData.map((entry) => (
                <Cell
                  key={entry.type}
                  fill={PIE_COLORS[entry.type] ?? "#d1d5db"}
                />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload;
                  return (
                    <div className="bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm shadow">
                      <p className="font-medium">{d.name}</p>
                      <p className="text-stone-500">{d.value} sessions · {d.avgRating}★ avg</p>
                    </div>
                  );
                }
                return null;
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend table */}
      <div className="space-y-2 mt-2">
        {pieData.map((d) => (
          <div key={d.type} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: PIE_COLORS[d.type] ?? "#d1d5db" }}
              />
              <span className="text-stone-700">{d.name}</span>
            </div>
            <div className="flex items-center gap-3 text-stone-400 text-xs">
              <span>{d.value} sessions</span>
              <span>{d.avgRating}★</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
