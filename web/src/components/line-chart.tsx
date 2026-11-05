"use client";

import { useMemo, useState } from "react";
import { dateHe } from "@/lib/format";

export type Line = { key: string; label: string; color: string; values: number[]; dashed?: boolean; width?: number };

/**
 * גרף קווים פשוט ב-SVG. ציר הזמן לפי אינדקס (ימי מסחר), ולכן הוא עובד גם עם תאריכים מוסתרים במצב עיוור.
 * גרפים פיננסיים נקראים משמאל לימין גם בעברית, ולכן הגרף עצמו ב-dir=ltr.
 */
export default function LineChart({
  dates,
  lines,
  shade,
  markers = [],
  height = 240,
  format = (n) => n.toLocaleString("he-IL", { maximumFractionDigits: 0 }),
}: {
  dates: string[];
  lines: Line[];
  shade?: { from: number; to: number } | null;
  markers?: { i: number; color: string; title: string }[];
  height?: number;
  format?: (n: number) => string;
}) {
  const W = 600;
  const H = height;
  const [hover, setHover] = useState<number | null>(null);
  const g = useMemo(() => {
    const all = lines.flatMap((l) => l.values).filter((v) => Number.isFinite(v));
    if (!all.length || dates.length < 2) return null;
    let lo = Math.min(...all), hi = Math.max(...all);
    const pad = (hi - lo) * 0.06 || 1;
    lo -= pad;
    hi += pad;
    const x = (i: number) => (i / (dates.length - 1)) * W;
    const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
    return { x, y, lo, hi, paths: lines.map((l) => l.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("")) };
  }, [dates, lines, H]);

  if (!g) return <div className="grid place-items-center text-muted" style={{ height }}>אין עדיין מספיק נתונים לגרף</div>;
  const hi = hover ?? dates.length - 1;

  return (
    <div>
      <div dir="ltr" className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="w-full block"
          style={{ height }}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setHover(Math.max(0, Math.min(dates.length - 1, Math.round(((e.clientX - r.left) / r.width) * (dates.length - 1)))));
          }}
          onMouseLeave={() => setHover(null)}
        >
          {shade && <rect x={g.x(shade.from)} y={0} width={Math.max(2, g.x(shade.to) - g.x(shade.from))} height={H} fill="var(--down-soft)" />}
          {lines.map((l, k) => (
            <path key={l.key} d={g.paths[k]} fill="none" stroke={l.color} strokeWidth={l.width ?? 2} strokeDasharray={l.dashed ? "6 4" : undefined} vectorEffect="non-scaling-stroke" />
          ))}
          {markers.map((m, k) => (
            <line key={k} x1={g.x(m.i)} x2={g.x(m.i)} y1={0} y2={H} stroke={m.color} strokeWidth={1} strokeDasharray="2 3" vectorEffect="non-scaling-stroke">
              <title>{m.title}</title>
            </line>
          ))}
          {hover != null && <line x1={g.x(hover)} x2={g.x(hover)} y1={0} y2={H} stroke="var(--muted)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        </svg>
        <div className="flex justify-between text-xs text-muted num mt-1">
          <span>{dateHe(dates[0])}</span>
          <span>{dateHe(dates.at(-1))}</span>
        </div>
      </div>
      <div className="flex gap-x-4 gap-y-1 flex-wrap text-xs mt-1">
        <span className="text-muted num">{dateHe(dates[hi])}</span>
        {lines.map((l) => (
          <span key={l.key} className="flex items-center gap-1">
            <i className="inline-block w-3 h-0.5" style={{ background: l.color, height: 3 }} />
            {l.label}: <b className="num">{format(l.values[hi])}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
