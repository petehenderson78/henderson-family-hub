"use client";

export interface MonthTrend {
  month: string; // e.g. "2026-02"
  label: string; // e.g. "Feb"
  total: number;
}

interface ExpenseTrendsProps {
  trends: MonthTrend[];
}

function formatCurrency(amount: number) {
  if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(1)}k`;
  }
  return `$${Math.round(amount)}`;
}

export default function ExpenseTrends({ trends }: ExpenseTrendsProps) {
  const maxTotal = Math.max(...trends.map((t) => t.total), 1);

  return (
    <div>
      <div className="flex items-end justify-between gap-2" style={{ height: 160 }}>
        {trends.map((t) => {
          const heightPct = Math.max((t.total / maxTotal) * 100, 2);
          return (
            <div
              key={t.month}
              className="flex flex-1 flex-col items-center justify-end"
              style={{ height: "100%" }}
            >
              <span className="mb-1.5 text-[10px] font-semibold text-slate-500">
                {t.total > 0 ? formatCurrency(t.total) : ""}
              </span>
              <div
                className="w-full max-w-[40px] rounded-t-lg"
                style={{
                  height: `${heightPct}%`,
                  background: "linear-gradient(to top, #3B82F6, #6366F1)",
                  minHeight: t.total > 0 ? 4 : 0,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between gap-2">
        {trends.map((t) => (
          <div key={t.month} className="flex-1 text-center">
            <span className="text-[11px] font-medium text-slate-400">
              {t.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
