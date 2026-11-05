"use client";

import { useEffect, useMemo, useState } from "react";
import LineChart from "@/components/line-chart";
import { api, dateHe, money, pct, tone } from "@/lib/format";
import type { JourneySeries } from "@/lib/timemachine/journey";

const RANGES = [
  { k: "month", label: "חודש", n: 22 },
  { k: "year", label: "שנה", n: 252 },
  { k: "all", label: "כל המסע", n: 0 },
] as const;

export default function JourneyChart({ id, version }: { id: string; version: string }) {
  const [s, setS] = useState<JourneySeries | null>(null);
  const [err, setErr] = useState("");
  const [range, setRange] = useState<(typeof RANGES)[number]["k"]>("all");

  useEffect(() => {
    let alive = true;
    api<JourneySeries>(`/api/portfolios/${id}/series`).then(
      (x) => alive && setS(x),
      (e) => alive && setErr((e as Error).message),
    );
    return () => {
      alive = false;
    };
  }, [id, version]);

  const view = useMemo(() => {
    if (!s) return null;
    const n = RANGES.find((r) => r.k === range)!.n;
    // חותכים לפי ימים קלנדריים ולא לפי מספר נקודות (בטווח ארוך הנקודות מדוללות). עובד גם עם "@ימים" במסע עיוור
    const dayNum = (d: string) => (d.startsWith("@") ? Number(d.slice(1)) : Date.parse(d) / 86400_000);
    const lastDay = s.points.length ? dayNum(s.points.at(-1)!.d) : 0;
    const span = n === 22 ? 31 : 365;
    const cut = n ? s.points.filter((p) => dayNum(p.d) >= lastDay - span) : s.points;
    const pts = cut.length >= 2 ? cut : s.points;
    const idx = (d: string) => pts.findIndex((p) => dayNum(p.d) >= dayNum(d));
    const from = idx(s.drawdown.peakD), to = idx(s.drawdown.troughD);
    return {
      pts,
      shade: s.drawdown.pct < -3 && from >= 0 && to > from ? { from, to } : null,
      markers: s.events.map((e) => ({ i: idx(e.d), color: e.kind === "up" ? "var(--up)" : e.kind === "down" ? "var(--down)" : "var(--warn)", title: `${dateHe(e.d)} · ${e.title}` })).filter((m) => m.i >= 0),
    };
  }, [s, range]);

  if (err) return <div className="card bg-down-soft text-down">{err}</div>;
  if (!s || !view) return <div className="card text-muted">מחשב את הגרף…</div>;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const diff = r1(r1(s.ret.portfolio) - r1(s.ret.bench)); // כמו בדו"ח המסע

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <div className="card">
          <LineChart
            dates={view.pts.map((p) => p.d)}
            shade={view.shade}
            markers={view.markers}
            lines={[
              { key: "dep", label: "הפקדות", color: "#b9bfcc", values: view.pts.map((p) => p.dep), dashed: true },
              { key: "b", label: `אילו הכול הלך ל-${s.benchLabel}`, color: "#9aa3b5", values: view.pts.map((p) => p.b) },
              { key: "v", label: "התיק שלך", color: "var(--brand)", values: view.pts.map((p) => p.v), width: 3 },
            ]}
            format={(n) => money(n, "ILS", 0)}
          />
          <div className="flex gap-1.5 mt-3">
            {RANGES.map((r) => (
              <button key={r.k} className={`chip text-xs ${range === r.k ? "chip-on" : ""}`} onClick={() => setRange(r.k)}>
                {r.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted mt-2">
            האזור האדום הוא הירידה הגדולה מהשיא. הקווים המקווקווים האנכיים הם אירועים שעברת (מעבר עם העכבר מראה פרטים). הגרף מגיע רק עד היום שבו אתה נמצא.
          </p>
        </div>
        <div className="space-y-3">
          <div className="card">
            <div className="text-xs text-muted">התיק שלך</div>
            <div className={`text-2xl font-bold num ${tone(s.ret.portfolio)}`}>{pct(s.ret.portfolio)}</div>
            <div className="text-xs text-muted">על מה שהפקדת, אחרי עמלות ומס</div>
          </div>
          <div className="card">
            <div className="text-xs text-muted">אותו כסף ב-{s.benchLabel}</div>
            <div className={`text-2xl font-bold num ${tone(s.ret.bench)}`}>{pct(s.ret.bench)}</div>
            <div className="text-xs text-muted">אותן הפקדות באותם ימים, כולל המרה, עמלת קנייה ודיבידנדים נטו. בלי מס מכירה</div>
          </div>
          <div className={`rounded-lg p-2.5 text-sm ${diff >= 0 ? "bg-up-soft text-up" : "bg-warn-soft text-[#6b4100]"}`}>
            {Math.abs(diff) < 0.5 ? "אתה צמוד למדד." : diff > 0 ? `אתה מקדים את המדד ב-${diff.toFixed(1)}%.` : `אתה מפגר אחרי המדד ב-${Math.abs(diff).toFixed(1)}%. רוב המשקיעים הפעילים מפגרים אחרי המדד לאורך זמן.`}
          </div>
          {s.drawdown.pct < -3 && (
            <div className="card text-sm">
              <div className="text-xs text-muted">הירידה הגדולה מהשיא</div>
              <b className="num text-down text-lg">{pct(s.drawdown.pct)}</b>
              <div className="text-xs text-muted num">{dateHe(s.drawdown.peakD)} ← {dateHe(s.drawdown.troughD)}</div>
            </div>
          )}
        </div>
      </div>
      {s.events.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-1">🗞 אירועים שעברת</h3>
          {[...s.events].reverse().map((e) => (
            <div key={e.d} className="flex gap-3 py-2 border-b border-line last:border-0 text-sm">
              <span className="num text-time font-semibold whitespace-nowrap">{dateHe(e.d)}</span>
              {e.spx != null && <span className={`text-xs px-2 rounded-full h-fit num ${e.spx < 0 ? "bg-down-soft text-down" : "bg-up-soft text-up"}`}>{pct(e.spx)}</span>}
              <span>
                <b>{e.title}.</b> {e.body}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
