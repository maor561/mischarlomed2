"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Term from "@/components/term";
import LineChart from "@/components/line-chart";
import { api, dateHe, money, pct, signed, tone } from "@/lib/format";
import type { PortfolioView } from "@/lib/engine/service";
import type { JourneySeries } from "@/lib/timemachine/journey";
import type { LedgerEntry } from "@/lib/engine/types";
import type { Journal } from "@/lib/mentor/journal";
import { NoteCard } from "./mentor-box";
import { LESSON_BY_N } from "@/lib/lessons/content";

const COLORS = ["#2753d6", "#0f8a4f", "#b26a00", "#6b3fd1", "#c8372d", "#0e7c86"];
const CASH_COLOR = "#9aa3b5";

type Props = {
  id: string;
  view: PortfolioView;
  version: string;
  journal: Journal | null;
  onTrade: (side: "buy" | "sell", symbol: string, qty?: number) => void;
  onTab: (tab: "chart" | "history" | "order" | "journal") => void;
};

export default function OverviewPanel({ id, view: v, version, journal, onTrade, onTab }: Props) {
  const [s, setS] = useState<JourneySeries | null>(null);
  useEffect(() => {
    let alive = true;
    api<JourneySeries>(`/api/portfolios/${id}/series`).then((x) => alive && setS(x), () => {});
    return () => {
      alive = false;
    };
  }, [id, version]);

  const t = v.totals;
  const dayIls = v.positions.reduce((a, p) => (p.dayPct == null ? a : a + p.valueIls - p.valueIls / (1 + p.dayPct / 100)), 0);
  const diff = s ? Math.round((Math.round(s.ret.portfolio * 10) - Math.round(s.ret.bench * 10))) / 10 : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <Kpi label="שווי התיק" value={money(t.total, "ILS", 0)} sub={<>הופקדו <N>{money(t.deposited, "ILS", 0)}</N></>} />
        <Kpi
          label={<><Term id="pnl">רווח/הפסד</Term> נטו</>}
          value={signed(t.pnl, "ILS", 0)}
          cls={tone(t.pnl)}
          sub={<><N>{pct(t.pnlPct)}</N>{v.positions.some((p) => p.dayPct != null) && <> · היום <N>{signed(dayIls, "ILS", 0)}</N></>}</>}
        />
        <Kpi
          label={<>לעומת <Term id="benchmark">מדד ייחוס</Term></>}
          value={diff == null ? "…" : pct(diff)}
          cls={diff == null ? "" : tone(diff)}
          sub={s ? <><N>{s.benchLabel}</N> עשה <N>{pct(s.ret.bench)}</N></> : "מחשב…"}
        />
        <Kpi
          label={<Term id="drawdown">ירידה מהשיא</Term>}
          value={s ? pct(s.currentFromPeak) : "…"}
          cls={s && s.currentFromPeak < -5 ? "text-down" : ""}
          sub={s ? <>הגדולה במסע: <N>{pct(s.drawdown.pct)}</N></> : ""}
        />
      </div>

      <WhatChanged id={id} v={v} onTab={onTab} />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4 min-w-0">
          <Holdings id={id} v={v} onTrade={onTrade} onTab={onTab} />
          {s && s.points.length > 2 && (
            <div className="card">
              <h3 className="font-semibold mb-2 flex items-center gap-2 flex-wrap">
                📈 התיק מול המדד
                <button className="text-xs font-normal text-brand underline" onClick={() => onTab("chart")}>לגרף המלא ←</button>
              </h3>
              <LineChart
                height={150}
                dates={s.points.map((p) => p.d)}
                lines={[
                  { key: "dep", label: "הפקדות", color: "#b9bfcc", values: s.points.map((p) => p.dep), dashed: true },
                  { key: "b", label: s.benchLabel, color: "#9aa3b5", values: s.points.map((p) => p.b) },
                  { key: "v", label: "התיק", color: "var(--brand)", values: s.points.map((p) => p.v), width: 3 },
                ]}
                format={(n) => money(n, "ILS", 0)}
              />
            </div>
          )}
        </div>
        <div className="space-y-4">
          <Allocation v={v} />
          <MentorCard v={v} journal={journal} onTab={onTab} />
          <NextLesson />
        </div>
      </div>
    </div>
  );
}

/** מספר בתוך טקסט עברי: מבודד משמאל לימין, כדי שהסימנים לא "יקפצו" */
const N = ({ children }: { children: React.ReactNode }) => <span className="num">{children}</span>;

function Kpi({ label, value, sub, cls = "" }: { label: React.ReactNode; value: string; sub: React.ReactNode; cls?: string }) {
  return (
    <div className="card">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-xl md:text-2xl font-bold num mt-1 ${cls}`}>{value}</div>
      <div className="text-xs text-muted">{sub}</div>
    </div>
  );
}

/* ---------- מה השתנה ---------- */

function entryLine(e: LedgerEntry): string {
  const ccy = (e.meta.currency as string) === "ILS" ? "ILS" : "USD";
  switch (e.kind) {
    case "buy": return `💼 קנייה ${e.qty} ${e.symbol} ב-${money(e.price, ccy)}`;
    case "sell": return `💼 מכירה ${-e.qty} ${e.symbol} ב-${money(e.price, ccy)}`;
    case "dividend": return `💵 דיבידנד ${e.symbol}: ${signed(ccy === "USD" ? e.cashUsd : e.cashIls, ccy)} נטו`;
    case "split": return `✂️ ${e.symbol} פוצלה: ${e.meta.before} → ${e.meta.after} מניות`;
    case "deposit": return `🏦 הפקדה ${money(e.cashIls, "ILS", 0)}`;
    case "fx": return `💱 המרה ${money(Number(e.meta.amount), String(e.meta.from), 0)}`;
    case "custody": return `🧾 דמי משמרת ${money(e.fee)}`;
  }
}

function WhatChanged({ id, v, onTab }: { id: string; v: PortfolioView; onTab: Props["onTab"] }) {
  const key = `stock-sim:seen:${id}`;
  // "מאז הפעם הקודמת": מזהה התנועה האחרונה שראית נשמר בדפדפן (נוחות אישית בלבד)
  const [seen] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(key) ?? 0);
    } catch {
      return 0;
    }
  });
  const maxId = v.history.reduce((a, e) => Math.max(a, e.id ?? 0), 0);
  useEffect(() => {
    try {
      localStorage.setItem(key, String(maxId));
    } catch {}
  }, [key, maxId]);

  const fresh = v.history.filter((e) => (e.id ?? 0) > seen && !(e.kind === "deposit" && e.meta.initial));
  const items = (fresh.length ? fresh : v.history.filter((e) => !(e.kind === "deposit" && e.meta.initial)).slice(0, 4)).slice(0, 8);
  if (!items.length && !v.pending.length) return null;
  return (
    <div className="card">
      <h3 className="font-semibold mb-2">📰 {fresh.length ? "מה השתנה מאז הפעם הקודמת" : "תנועות אחרונות"}</h3>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {items.map((e) => (
          <div key={e.id} className="bg-white border border-line rounded-lg px-3 py-2 text-sm whitespace-nowrap">
            <span className="text-xs text-muted num me-1">{dateHe(e.d)}</span> {entryLine(e)}
          </div>
        ))}
        {v.pending.length > 0 && (
          <button className="bg-warn-soft text-[#6b4100] rounded-lg px-3 py-2 text-sm whitespace-nowrap" onClick={() => onTab("history")}>
            ⏳ {v.pending.length} פקודות ממתינות
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- החזקות ---------- */

function Holdings({ id, v, onTrade, onTab }: { id: string; v: PortfolioView; onTrade: Props["onTrade"]; onTab: Props["onTab"] }) {
  const total = v.totals.total || 1;
  const cashPct = (v.totals.cashIls / total) * 100;
  return (
    <div className="card">
      <h3 className="font-semibold mb-2">ההחזקות שלי</h3>
      {v.positions.length === 0 ? (
        <p className="text-muted text-sm py-3">
          עוד אין מניות בתיק. <button className="text-brand underline" onClick={() => onTab("order")}>לשליחת פקודה ראשונה</button>
        </p>
      ) : (
        <>
          {/* מחשב: טבלה */}
          <table className="w-full text-sm hidden md:table">
            <thead>
              <tr className="text-xs text-muted border-b border-line">
                <th className="text-start py-2">נייר</th><th className="text-start">כמות</th><th className="text-start">שווי (₪)</th><th className="text-start">% מהתיק</th><th className="text-start">היום</th><th className="text-start">מאז הקנייה</th><th />
              </tr>
            </thead>
            <tbody>
              {v.positions.map((p, i) => {
                const w = (p.valueIls / total) * 100;
                return (
                  <tr key={p.symbol} className="border-b border-line">
                    <td className="py-2">
                      <Link href={`/p/${id}/stock/${encodeURIComponent(p.symbol)}`} className="font-bold num hover:text-brand">{p.symbol}</Link>{" "}
                      <KindTag kind={p.kind} currency={p.currency} />
                      <div className="text-xs text-muted truncate max-w-[220px]">{p.name}{p.sector ? ` · ${p.sector}` : p.kind !== "EQUITY" ? " · מפוזר" : ""}</div>
                    </td>
                    <td className="num">{p.qty}</td>
                    <td className="num">{money(p.valueIls, "ILS", 0)}</td>
                    <td><WeightBar pct={w} color={COLORS[i % COLORS.length]} /></td>
                    <td className={`num ${p.dayPct == null ? "text-muted" : tone(p.dayPct)}`}>{p.dayPct == null ? "—" : pct(p.dayPct)}</td>
                    <td className={`num ${tone(p.pnlPct)}`} title={`${signed(p.pnlIls, "ILS", 0)} · קנייה ממוצעת ${money(p.avgCost, p.currency)}`}>{pct(p.pnlPct)}</td>
                    <td className="whitespace-nowrap">
                      <button className="chip text-xs" onClick={() => onTrade("buy", p.symbol)}>קנה</button>{" "}
                      <button className="chip text-xs" onClick={() => onTrade("sell", p.symbol, p.qty)}>מכור</button>
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td className="py-2"><b>💵 מזומן</b><div className="text-xs text-muted num">{money(v.cash.ILS, "ILS", 0)} + {money(v.cash.USD, "USD", 0)}</div></td>
                <td />
                <td className="num">{money(v.totals.cashIls, "ILS", 0)}</td>
                <td><WeightBar pct={cashPct} color={CASH_COLOR} /></td>
                <td colSpan={3} />
              </tr>
            </tbody>
          </table>
          {/* טלפון: כרטיסים */}
          <div className="md:hidden space-y-2">
            {v.positions.map((p) => (
              <div key={p.symbol} className="border border-line rounded-lg p-2.5">
                <div className="flex justify-between items-baseline">
                  <Link href={`/p/${id}/stock/${encodeURIComponent(p.symbol)}`} className="font-bold num">{p.symbol}</Link>
                  <span className="num">{money(p.valueIls, "ILS", 0)} · {((p.valueIls / total) * 100).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-muted">{p.qty} יח&apos; · היום <span className={`num ${tone(p.dayPct ?? 0)}`}>{p.dayPct == null ? "—" : pct(p.dayPct)}</span></span>
                  <span className={`num ${tone(p.pnlPct)}`}>{pct(p.pnlPct)} מאז הקנייה</span>
                </div>
                <div className="flex gap-2 mt-2">
                  <button className="chip text-xs flex-1" onClick={() => onTrade("buy", p.symbol)}>קנה</button>
                  <button className="chip text-xs flex-1" onClick={() => onTrade("sell", p.symbol, p.qty)}>מכור</button>
                </div>
              </div>
            ))}
            <div className="flex justify-between text-sm px-1"><b>💵 מזומן</b><span className="num">{money(v.totals.cashIls, "ILS", 0)} · {cashPct.toFixed(0)}%</span></div>
          </div>
          <p className="text-xs text-muted mt-2">לחיצה על שם נייר פותחת את דף הנייר. &quot;מאז הקנייה&quot; כולל עמלות ושינויי שער הדולר.</p>
        </>
      )}
    </div>
  );
}

function KindTag({ kind, currency }: { kind: string; currency: string }) {
  if (kind === "ETF") return <span className="text-[11px] px-1.5 rounded-full bg-up-soft text-up">קרן סל</span>;
  if (currency === "ILS") return <span className="text-[11px] px-1.5 rounded-full bg-[#e8f3ff] text-[#1460a8]">ת&quot;א</span>;
  return <span className="text-[11px] px-1.5 rounded-full bg-brand-soft text-brand">מניה</span>;
}

function WeightBar({ pct: p, color }: { pct: number; color: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block w-16 h-1.5 bg-bg rounded-full overflow-hidden">
        <i className="block h-full" style={{ width: `${Math.min(100, p)}%`, background: color }} />
      </span>
      <span className="num text-xs">{p.toFixed(0)}%</span>
    </span>
  );
}

/* ---------- פיזור ---------- */

function Allocation({ v }: { v: PortfolioView }) {
  const total = v.totals.total || 1;
  const fx = v.fx;
  const slices = useMemo(() => {
    const top = v.positions.slice(0, 5).map((p, i) => ({ label: p.symbol, value: p.valueIls, color: COLORS[i % COLORS.length] }));
    const rest = v.positions.slice(5).reduce((a, p) => a + p.valueIls, 0);
    if (rest > 0) top.push({ label: "אחר", value: rest, color: "#c3c8d4" });
    if (v.totals.cashIls > 0) top.push({ label: "מזומן", value: v.totals.cashIls, color: CASH_COLOR });
    return top;
  }, [v]);

  const usd = v.positions.filter((p) => p.currency === "USD").reduce((a, p) => a + p.valueIls, 0) + v.cash.USD * fx;
  const usdPct = Math.max(0, Math.min(100, (usd / total) * 100));

  const holdingsTotal = v.positions.reduce((a, p) => a + p.valueIls, 0) || 1;
  const sectors = new Map<string, number>();
  for (const p of v.positions) {
    const k = p.kind !== "EQUITY" ? "מפוזר (קרן סל)" : (p.sector ?? "לא ידוע");
    sectors.set(k, (sectors.get(k) ?? 0) + p.valueIls);
  }
  const sectorList = [...sectors.entries()].sort((a, b) => b[1] - a[1]);
  const conc = v.positions.find((p) => p.kind === "EQUITY" && p.valueIls / total > 0.25);

  // היסט של כל פרוסה בעוגה (סכום מצטבר), מחושב מראש
  const offsets = slices.reduce<number[]>((a, sl, i) => [...a, (a[i - 1] ?? 0) + (i ? (slices[i - 1].value / total) * 100 : 0)], []);
  return (
    <>
      <div className="card">
        <h3 className="font-semibold mb-2">🥧 <Term id="diversification">פיזור</Term> לפי נייר</h3>
        <div className="flex gap-4 items-center flex-wrap">
          <svg viewBox="0 0 42 42" width="112" height="112" className="-rotate-90">
            {slices.map((sl, i) => {
              const p = (sl.value / total) * 100;
              return <circle key={sl.label} cx="21" cy="21" r="15.915" fill="none" stroke={sl.color} strokeWidth="7" strokeDasharray={`${p} ${100 - p}`} strokeDashoffset={-offsets[i]} />;
            })}
          </svg>
          <div className="text-sm space-y-0.5">
            {slices.map((sl) => (
              <div key={sl.label} className="flex items-center gap-1.5">
                <i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: sl.color }} />
                <span className="num">{sl.label}</span> <span className="num text-muted">{((sl.value / total) * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
        {v.positions.length > 0 && (
          <div className={`text-sm rounded-lg p-2.5 mt-2 ${conc ? "bg-warn-soft text-[#6b4100]" : "bg-brand-soft text-[#1d3c9e]"}`}>
            {conc ? (
              <>⚠️ {conc.symbol} היא {((conc.valueIls / total) * 100).toFixed(0)}% מהתיק. זה <Term id="concentration">ריכוז</Term> גבוה במניה אחת.</>
            ) : (
              <>✅ אין מניה בודדת מעל 25%. קרן סל רחבה לא נחשבת <Term id="concentration">ריכוז</Term>.</>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="font-semibold mb-2">💱 לפי מטבע</h3>
        <div className="h-3.5 rounded-full overflow-hidden flex">
          <i className="block h-full bg-brand" style={{ width: `${usdPct}%` }} />
          <i className="block h-full bg-up" style={{ width: `${100 - usdPct}%` }} />
        </div>
        <div className="text-sm mt-1.5">
          <b className="text-brand num">{usdPct.toFixed(0)}% בדולר</b> · <b className="text-up num">{(100 - usdPct).toFixed(0)}% בשקל</b>
        </div>
        {usdPct > 50 && (
          <div className="text-sm rounded-lg p-2.5 mt-2 bg-warn-soft text-[#6b4100]">
            רוב התיק ב<Term id="fx-exposure">חשיפה לדולר</Term>. אם הדולר ייחלש ב-10%, התיק יירד בכ-{(usdPct / 10).toFixed(0)}% גם אם המניות לא יזוזו.
          </div>
        )}
      </div>

      {v.positions.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-2">🏭 לפי <Term id="sector">סקטור</Term></h3>
          {sectorList.map(([k, val]) => (
            <div key={k} className="grid grid-cols-[110px_1fr_40px] gap-2 items-center text-sm py-0.5">
              <span className="truncate">{k}</span>
              <span className="h-2 bg-bg rounded-full overflow-hidden">
                <i className="block h-full" style={{ width: `${(val / holdingsTotal) * 100}%`, background: k.startsWith("מפוזר") ? CASH_COLOR : "var(--brand)" }} />
              </span>
              <span className="num text-xs">{((val / holdingsTotal) * 100).toFixed(0)}%</span>
            </div>
          ))}
          <p className="text-xs text-muted mt-1">מחושב רק מתוך ההחזקות, בלי מזומן.</p>
        </div>
      )}
    </>
  );
}

/* ---------- כרטיס המנטור (D21) ---------- */

function MentorCard({ v, journal: j, onTab }: { v: PortfolioView; journal: Journal | null; onTab: Props["onTab"] }) {
  const total = v.totals.total || 1;
  const cashPct = (v.totals.cashIls / total) * 100;
  const notes: { level: string; icon: string; title: string; body: string; go?: boolean }[] = [];
  if (j && j.dueCount > 0) {
    const due = j.entries.filter((e) => e.due).slice(0, 3).map((e) => `${e.symbol} מ-${dateHe(e.d)}`).join(", ");
    notes.push({ level: "warn", icon: "⏰", title: `${j.dueCount} עסקאות מחכות לבדיקה`, body: due, go: true });
  }
  if (v.positions.length && cashPct > 50) {
    notes.push({ level: "warn", icon: "💤", title: `${Math.round(cashPct)}% מהתיק במזומן`, body: "זו החלטה? אם כן, כתוב אותה ביומן. אם לא, כדאי לחשוב מה התוכנית לכסף הזה." });
  }
  if (!v.positions.length) {
    notes.push({ level: "info", icon: "👋", title: "עוד לא קנית כלום", body: "התחל בפקודה אחת, וכתוב למה. המנטור יגיב לנימוק שלך, וביומן תוכל לחזור אליו אחר כך." });
  }
  if (j?.insight) notes.push({ level: "good", icon: "📈", title: "הדפוס שלך", body: j.insight });
  const last = j?.entries[0];
  if (last && last.mentor.length && notes.length < 3) {
    const n = last.mentor[0];
    notes.push({ level: n.level, icon: n.icon, title: `על ${last.side === "buy" ? "הקנייה" : "המכירה"} האחרונה (${last.symbol}): ${n.title}`, body: n.body });
  }
  return (
    <div className="card space-y-2">
      <h3 className="font-semibold flex items-center gap-2">🤖 המנטור <button className="text-xs font-normal text-brand underline" onClick={() => onTab("journal")}>ליומן ←</button></h3>
      {!j ? <p className="text-xs text-muted">טוען…</p> : notes.length === 0 ? <p className="text-sm text-muted">אין הערות כרגע. 👍</p> : notes.slice(0, 3).map((n, i) => (
        <div key={i} className={n.go ? "cursor-pointer" : ""} onClick={() => n.go && onTab("journal")}>
          <NoteCard n={n} />
        </div>
      ))}
    </div>
  );
}

/* ---------- השיעור הבא (D27) ---------- */

function NextLesson() {
  const [p, setP] = useState<{ done: number; total: number; next: number | null } | null>(null);
  useEffect(() => {
    let alive = true;
    api<{ done: number; total: number; next: number | null }>("/api/lessons/progress").then((x) => alive && setP(x), () => {});
    return () => {
      alive = false;
    };
  }, []);
  const l = p?.next ? LESSON_BY_N.get(p.next) : null;
  return (
    <div className="card">
      <h3 className="font-semibold mb-1 flex items-center gap-2">
        📚 השיעור הבא <span className="text-xs text-muted font-normal num">{p ? `${p.done}/${p.total}` : ""}</span>
      </h3>
      {!p ? (
        <p className="text-xs text-muted">טוען…</p>
      ) : l ? (
        <>
          <b className="block text-sm">שיעור {l.n}: {l.title}</b>
          <span className="text-xs text-muted">{l.minutes} דק&apos; · משימה: {l.mission.text}</span>
          <Link href={`/lessons/${l.n}`} className="btn block text-center mt-2 !py-2">{p.done ? "להמשיך" : "להתחיל"} ←</Link>
        </>
      ) : (
        <p className="text-sm">סיימת את כל המסלול 🎓</p>
      )}
    </div>
  );
}
