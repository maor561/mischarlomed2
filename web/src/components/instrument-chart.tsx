"use client";

import { useEffect, useState } from "react";
import LineChart from "@/components/line-chart";
import { api, money } from "@/lib/format";
import type { InstrumentChart as ChartData } from "@/lib/timemachine/journey";

const RANGES = [
  { days: 31, label: "חודש" },
  { days: 365, label: "שנה" },
  { days: 1826, label: "5 שנים" },
  { days: 3650, label: "10 שנים" },
];

/** גרף נייר עד היום שבו נמצאים בסימולציה. אין הצצה לעתיד */
export default function InstrumentChart({ id, symbol, version, height = 150, initialDays = 365 }: { id: string; symbol: string; version: string; height?: number; initialDays?: number }) {
  const [days, setDays] = useState(initialDays);
  const [c, setC] = useState<ChartData | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    api<ChartData>(`/api/portfolios/${id}/chart?symbol=${encodeURIComponent(symbol)}&days=${days}`).then(
      (x) => {
        if (!alive) return;
        setC(x);
        setErr("");
      },
      (e) => alive && setErr((e as Error).message),
    );
    return () => {
      alive = false;
    };
  }, [id, symbol, days, version]);
  if (err) return null;
  if (!c) return <div className="grid place-items-center text-xs text-muted" style={{ height }}>טוען גרף…</div>;
  const first = c.bars[0]?.c ?? 0, last = c.bars.at(-1)?.c ?? 0;
  const ch = first ? ((last / first - 1) * 100).toFixed(1) : "0";
  return (
    <div>
      <LineChart
        dates={c.bars.map((b) => b.d)}
        lines={[{ key: "c", label: "מחיר סגירה", color: last >= first ? "var(--up)" : "var(--down)", values: c.bars.map((b) => b.c) }]}
        height={height}
        format={(n) => money(n, c.currency)}
      />
      <div className="flex gap-1.5 items-center mt-1 flex-wrap">
        {RANGES.map((r) => (
          <button key={r.days} className={`chip text-xs ${days === r.days ? "chip-on" : ""}`} onClick={() => setDays(r.days)}>
            {r.label}
          </button>
        ))}
        <span className={`text-xs num ms-2 ${Number(ch) >= 0 ? "text-up" : "text-down"}`}>
          {Number(ch) > 0 ? "+" : ""}
          {ch}% בתקופה
        </span>
      </div>
    </div>
  );
}
