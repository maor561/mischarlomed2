"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, dateHe, money, pct, signed, tone } from "@/lib/format";
import type { JourneyReport } from "@/lib/timemachine/journey";

export default function ReportPanel({ id, version }: { id: string; version: string }) {
  const [r, setR] = useState<JourneyReport | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    api<JourneyReport>(`/api/portfolios/${id}/report`).then(
      (x) => alive && setR(x),
      (e) => alive && setErr((e as Error).message),
    );
    return () => {
      alive = false;
    };
  }, [id, version]);

  if (err) return <div className="card bg-down-soft text-down">{err}</div>;
  if (!r) return <div className="card text-muted">מכין את הדו&quot;ח…</div>;
  const s = r.series;

  return (
    <div className="space-y-4">
      {!r.finished && (
        <div className="rounded-lg p-2.5 text-sm bg-time-soft text-time">📍 זה דו&quot;ח ביניים, נכון ל-{dateHe(r.period.end)}. הדו&quot;ח המלא נפתח כשמגיעים לסוף המסע.</div>
      )}
      {r.reveal && (
        <div className="rounded-2xl p-5 text-white" style={{ background: "linear-gradient(135deg,#6b3fd1,#2753d6)" }}>
          <div className="text-sm opacity-80">🎭 חשיפה</div>
          <h2 className="text-xl font-bold">{r.reveal.name ? `היית ב${r.reveal.name}!` : "זו הייתה התקופה שלך"}</h2>
          <div className="num">
            {dateHe(r.reveal.start)} עד {dateHe(r.reveal.end)}
          </div>
        </div>
      )}

      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Kpi label="התשואה שלך" v={pct(r.series.ret.portfolio)} cls={tone(s.ret.portfolio)} sub="על מה שהפקדת, נטו" />
        <Kpi label={`${s.benchLabel} באותה תקופה`} v={pct(s.ret.bench)} cls={tone(s.ret.bench)} sub="באותן הפקדות" />
        <Kpi label="ירידה מקסימלית" v={pct(s.drawdown.pct)} cls="text-down" sub={`${dateHe(s.drawdown.peakD)} ← ${dateHe(s.drawdown.troughD)}`} />
        <Kpi label="עלויות" v={money(r.costs.trade + r.costs.fx + r.costs.custody + r.costs.tax, "ILS", 0)} sub={`עמלות ${money(r.costs.trade + r.costs.fx + r.costs.custody, "ILS", 0)} · מס ${money(r.costs.tax, "ILS", 0)}`} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card overflow-x-auto">
          <h3 className="font-semibold mb-2">העסקאות</h3>
          {r.trades.count === 0 ? (
            <p className="text-sm text-muted">לא ביצעת עסקאות.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {[
                  ["🏆 הכי טובה", r.trades.best],
                  ["💥 הכי גרועה", r.trades.worst],
                ].map(([label, t]) =>
                  t && typeof t === "object" ? (
                    <tr key={label as string} className="border-b border-line align-top">
                      <td className="py-2 whitespace-nowrap">{label as string}</td>
                      <td className="num font-semibold">{t.symbol}{t.open && <span className="text-xs text-muted font-normal"> (עוד בתיק)</span>}</td>
                      <td className={`num ${tone(t.pct)}`}>{pct(t.pct)}</td>
                      <td className="text-muted text-xs">{t.why ? `"${t.why}"` : ""}</td>
                    </tr>
                  ) : null,
                )}
                {r.trades.panic && (
                  <tr className="border-b border-line align-top">
                    <td className="py-2 whitespace-nowrap">😬 מכירה בירידה</td>
                    <td className="num font-semibold">{r.trades.panic.symbol}</td>
                    <td className="num text-down">{pct(r.trades.panic.pct)}</td>
                    <td className="text-muted text-xs">{r.trades.panic.why ? `"${r.trades.panic.why}"` : ""}</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
          <p className="text-xs text-muted mt-2">
            {r.trades.count} עסקאות · {r.investedPct.toFixed(0)}% מהזמן מושקע
            {r.trades.avgHeldDays != null && ` · זמן החזקה ממוצע ${r.trades.avgHeldDays} ימים`}
          </p>
        </div>
        <div className="card">
          <h3 className="font-semibold mb-2">מה היה קורה אילו…</h3>
          {r.whatIf.map((w, i) => (
            <div key={i} className="flex justify-between gap-3 text-sm py-1.5 border-b border-line last:border-0">
              <span>…{w.text.replace(/(\d{4}-\d{2}-\d{2}|@\d+)/g, (d) => dateHe(d))}</span>
              <span className={`num whitespace-nowrap ${tone(w.ils)}`}>{signed(w.ils, "ILS", 0)}</span>
            </div>
          ))}
          <p className="text-xs text-muted mt-1">פלוס = היית מרוויח יותר. מינוס = היית מרוויח פחות.</p>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-1">{r.finished ? "שלושה דברים לקחת מהמסע" : "מה רואים עד עכשיו"}</h3>
        {r.lessons.length === 0 ? (
          <p className="text-sm text-muted">עוד אין מספיק פעילות בשביל תובנות.</p>
        ) : (
          r.lessons.map((l, i) => (
            <div key={i} className="flex gap-2 py-1.5 text-sm">
              <span>{["1️⃣", "2️⃣", "3️⃣"][i]}</span>
              <span>{l.replace(/(\d{4}-\d{2}-\d{2}|@\d+)/g, (d) => dateHe(d))}</span>
            </div>
          ))
        )}
        <p className="text-xs text-muted mt-1">בחבילה 5 המנטור יכתוב את התובנות האלה אישית, לפי מה שכתבת ביומן.</p>
      </div>

      {r.finished && (
        <div className="flex gap-2 flex-wrap">
          <Link href="/new?blind=1" className="btn">🎲 מסע עיוור חדש</Link>
          <Link href="/new" className="px-4 py-2.5 rounded-lg border border-brand text-brand font-semibold">מסע חדש</Link>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, v, sub, cls = "" }: { label: string; v: string; sub: string; cls?: string }) {
  return (
    <div className="card">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-2xl font-bold num ${cls}`}>{v}</div>
      <div className="text-xs text-muted num">{sub}</div>
    </div>
  );
}
