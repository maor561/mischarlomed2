"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import SymbolDot from "@/components/symbol-dot";
import { api, dateHe, money, pct, signed, tone } from "@/lib/format";
import { useAdvanced } from "@/lib/use-advanced";
import { planDue } from "@/lib/engine/process";
import type { PortfolioView } from "@/lib/engine/service";
import type { JourneySeries } from "@/lib/timemachine/journey";
import type { Journal } from "@/lib/mentor/journal";
import type { StoreItem } from "@/lib/store/store";
import type { TradeIntent } from "@/components/trade-sheet";
import { MentorCard, NextLesson, WhatChanged } from "./overview-panel";
import { planWhen } from "./plans-panel";

type Tab = "store" | "plans" | "history" | "journal" | "chart";
const RANGES = [
  { k: 7, label: "שבוע" },
  { k: 31, label: "חודש" },
  { k: 365, label: "שנה" },
  { k: 0, label: "הכול" },
] as const;

/** מספר יום לצורך סינון טווח. תומך גם בתאריכים מוסתרים ("@47") */
const dayNum = (d: string) => (d.startsWith("@") ? Number(d.slice(1)) : Math.round(Date.parse(d) / 86400_000));

/**
 * מסך הבית (סקיצה 07): מספר אחד גדול, שינוי יומי, גרף, שלוש פעולות,
 * ההשקעות שלי / רשימת מעקב, ובצד: המנטור, השיעור הבא והתוכניות.
 */
export default function HomePanel({ id, view: v, version, journal, onTrade, onTab }: {
  id: string;
  view: PortfolioView;
  version: string;
  journal: Journal | null;
  onTrade: (t: TradeIntent) => void;
  onTab: (t: Tab) => void;
}) {
  const advanced = useAdvanced();
  const [s, setS] = useState<JourneySeries | null>(null);
  const [range, setRange] = useState<number>(365);
  const [list, setList] = useState<"mine" | "watch">("mine");

  useEffect(() => {
    let alive = true;
    api<JourneySeries>(`/api/portfolios/${id}/series`).then((x) => alive && setS(x), () => {});
    return () => {
      alive = false;
    };
  }, [id, version]);

  const t = v.totals;
  const total = t.total || 1;
  const dayIls = v.positions.reduce((a, p) => (p.dayPct == null ? a : a + p.valueIls - p.valueIls / (1 + p.dayPct / 100)), 0);
  const dayPct = t.total - dayIls ? (dayIls / (t.total - dayIls)) * 100 : 0;

  const pts = useMemo(() => {
    if (!s?.points.length) return [];
    const last = dayNum(s.points.at(-1)!.d);
    return range ? s.points.filter((p) => dayNum(p.d) >= last - range) : s.points;
  }, [s, range]);

  const active = v.portfolio.plans.filter((p) => p.status === "active");

  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr] items-start">
      <div className="space-y-4 min-w-0">
        <div className="card">
          <div className="text-xs text-muted">שווי התיק</div>
          <div className="text-4xl font-extrabold num tracking-tight">{money(t.total, "ILS", 0)}</div>
          <div className="flex items-center gap-2 flex-wrap mt-1">
            {v.positions.some((p) => p.dayPct != null) && (
              <span className={`pill ${dayIls >= 0 ? "bg-up-soft text-up" : "bg-down-soft text-down"}`}>
                {dayIls >= 0 ? "▲" : "▼"} <span className="num">{signed(dayIls, "ILS", 0)} ({pct(dayPct)})</span> היום
              </span>
            )}
            <span className="text-xs text-muted">
              · <span className={`num ${tone(t.pnl)}`}>{pct(t.pnlPct)}</span> מההתחלה (<span className="num">{signed(t.pnl, "ILS", 0)}</span>)
            </span>
          </div>
          <AvailableCard available={t.availableIls} reserved={t.reservedIls} onInvest={() => onTrade({ side: "buy" })} />
          <Spark points={pts} />
          <div className="seg mt-1">
            {RANGES.map((r) => (
              <button key={r.k} aria-pressed={range === r.k} onClick={() => setRange(r.k)}>{r.label}</button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            <button className="rounded-[18px] py-2.5 text-xs font-semibold bg-sun text-ink" onClick={() => onTrade({ side: "buy" })}>
              <b className="block text-xl leading-tight">＋</b>להשקיע
            </button>
            <button className="rounded-[18px] py-2.5 text-xs font-semibold bg-mint-soft text-[#0c7a66]" onClick={() => onTab("plans")}>
              <b className="block text-xl leading-tight">🔁</b>תוכנית קבועה
            </button>
            <button className="rounded-[18px] py-2.5 text-xs font-semibold bg-coral-soft text-[#b5401f]" onClick={() => onTab("store")}>
              <b className="block text-xl leading-tight">🛍️</b>חנות
            </button>
          </div>
        </div>

        <WhatChanged id={id} v={v} onTab={onTab} />

        <div className="card !py-2">
          <div className="seg my-1.5">
            <button aria-pressed={list === "mine"} onClick={() => setList("mine")}>ההשקעות שלי</button>
            <button aria-pressed={list === "watch"} onClick={() => setList("watch")}>רשימת מעקב{v.portfolio.watchlist.length ? ` (${v.portfolio.watchlist.length})` : ""}</button>
          </div>
          {list === "mine" ? (
            <>
              {v.positions.length === 0 && (
                <p className="text-sm text-muted py-3">
                  עוד אין השקעות. <button className="underline text-ink font-semibold" onClick={() => onTrade({ side: "buy" })}>להשקעה ראשונה</button>, או לחנות לראות אוספים לפי נושא.
                </p>
              )}
              {v.positions.map((p) => (
                <Link key={p.symbol} href={`/p/${id}/stock/${encodeURIComponent(p.symbol)}`} className="flex items-center gap-2.5 py-2.5 border-b border-line last:border-0">
                  <SymbolDot symbol={p.symbol} />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-sm"><bdi>{p.name}</bdi></b>
                    <span className="text-xs text-muted">
                      <span className="num">{p.symbol}</span> · <span className="num">{Number(p.qty.toFixed(6))}</span> {p.kind === "ETF" ? "יח'" : "מניות"} · <span className="num">{((p.valueIls / total) * 100).toFixed(0)}%</span>
                    </span>
                  </span>
                  <span className="text-end">
                    <b className="block num text-sm">{money(p.valueIls, "ILS", 0)}</b>
                    <span className={`text-xs num ${tone(p.pnlPct)}`}>{pct(p.pnlPct)}</span>
                  </span>
                </Link>
              ))}
              <div className="flex items-center gap-2.5 py-2.5 border-t border-line">
                <span className="w-[38px] text-center text-xl">💵</span>
                <span className="flex-1">
                  <b className="block text-sm">מזומן</b>
                  <span className="text-xs text-muted">
                    {t.reservedIls > 0 ? <>מתוכו <span className="num">{money(t.availableIls, "ILS", 0)}</span> זמין להשקעה</> : "כולו זמין להשקעה"}
                    {advanced && <> · <span className="num">{money(v.cash.ILS, "ILS", 0)} + {money(v.cash.USD, "USD", 0)}</span></>}
                  </span>
                </span>
                <b className="num text-sm">{money(t.cashIls, "ILS", 0)}</b>
              </div>
              {v.pending.length > 0 && (
                <button className="w-full text-start text-sm rounded-xl bg-warn-soft text-[#6b4100] px-3 py-2 mb-1.5" onClick={() => onTab("history")}>
                  ⏳ {v.pending.length} פקודות ממתינות לביצוע ←
                </button>
              )}
            </>
          ) : (
            <Watchlist id={id} version={version} />
          )}
        </div>
      </div>

      <div className="space-y-4">
        <MentorCard v={v} journal={journal} onTab={onTab} />
        <NextLesson />
        <div className="card">
          <div className="flex items-center gap-2">
            <b className="flex-1">🔁 תוכניות קבועות</b>
            <button className="text-xs underline" onClick={() => onTab("plans")}>{active.length ? "לניהול" : "ליצירה"} ←</button>
          </div>
          {active.length === 0 ? (
            <p className="text-xs text-muted mt-1">סכום קבוע שמושקע אוטומטית כל חודש או שבוע. הדרך שעובדת לרוב האנשים.</p>
          ) : (
            active.slice(0, 3).map((p) => (
              <div key={p.id} className="text-xs text-muted mt-1.5">
                <b className="text-ink">{p.name}</b> · <span className="num">{money(p.amount, "ILS", 0)}</span> {planWhen(p)}
                {p.items.length > 0 && <> · {p.items.map((i) => `${i.pct}% ${i.symbol}`).join(" · ")}</>}
                {nextRun(p, v.portfolio.simDate) && <div>הבאה: <b className="num text-ink">{dateHe(nextRun(p, v.portfolio.simDate))}</b></div>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/** כמה כסף אפשר להשקיע עכשיו: מזומן פחות מה ששמור לפקודות ממתינות (שקלים ודולרים יחד) */
function AvailableCard({ available, reserved, onInvest }: { available: number; reserved: number; onInvest: () => void }) {
  return (
    <button onClick={onInvest} className="w-full mt-3 flex items-center gap-3 rounded-[18px] bg-sun-soft px-3.5 py-2.5 text-start">
      <span className="text-2xl">💵</span>
      <span className="flex-1 min-w-0">
        <span className="block text-xs text-ink-2">זמין להשקעה עכשיו</span>
        <b className="block text-2xl font-extrabold num leading-tight">{money(available, "ILS", 0)}</b>
        <span className="block text-[11px] text-muted">
          {reserved > 0 ? <>עוד <span className="num">{money(reserved, "ILS", 0)}</span> שמורים לפקודות שממתינות לביצוע</> : "שקלים ודולרים יחד. ההמרה בקנייה אוטומטית"}
        </span>
      </span>
      <span className="pill bg-sun text-ink shrink-0">להשקיע ←</span>
    </button>
  );
}

/** הביצוע הבא של תוכנית (לא במסע עיוור, שבו התאריכים מוסתרים) */
function nextRun(p: Parameters<typeof planDue>[0], simDate: string): string | null {
  if (simDate.startsWith("@")) return null;
  for (let i = 1; i <= 40; i++) {
    const d = new Date(Date.parse(simDate + "T12:00:00Z") + i * 86400_000).toISOString().slice(0, 10);
    if (planDue(p, d)) return d;
  }
  return null;
}

/** גרף שטח קטן של שווי התיק (בלי צירים, כמו באפליקציה) */
function Spark({ points }: { points: { d: string; v: number }[] }) {
  if (points.length < 2) return <div className="h-[110px] grid place-items-center text-xs text-muted">{points.length ? "הגרף יופיע אחרי כמה ימי מסחר" : "…"}</div>;
  const vs = points.map((p) => p.v);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const span = hi - lo || 1;
  const xy = points.map((p, i) => `${((i / (points.length - 1)) * 300).toFixed(1)},${(100 - ((p.v - lo) / span) * 88 - 6).toFixed(1)}`);
  const up = vs.at(-1)! >= vs[0];
  const color = up ? "var(--plum)" : "var(--down)";
  return (
    <svg viewBox="0 0 300 110" preserveAspectRatio="none" className="w-full h-[110px] mt-2" aria-label="גרף שווי התיק">
      <defs>
        <linearGradient id="spark-g" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`M${xy.join(" L")} L300,110 L0,110Z`} fill="url(#spark-g)" />
      <polyline points={xy.join(" ")} fill="none" stroke={color} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Watchlist({ id, version }: { id: string; version: string }) {
  const [items, setItems] = useState<StoreItem[] | null>(null);
  useEffect(() => {
    let alive = true;
    api<StoreItem[]>(`/api/portfolios/${id}/watch`).then((x) => alive && setItems(x), () => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [id, version]);
  if (!items) return <p className="text-xs text-muted py-3">טוען…</p>;
  if (!items.length) return <p className="text-sm text-muted py-3">אין עדיין ניירות במעקב. בדף של כל נייר יש ☆ להוספה.</p>;
  return (
    <>
      {items.map((x) => (
        <Link key={x.symbol} href={`/p/${id}/stock/${encodeURIComponent(x.symbol)}`} className="flex items-center gap-2.5 py-2.5 border-b border-line last:border-0">
          <SymbolDot symbol={x.symbol} />
          <span className="min-w-0 flex-1">
            <b className="block truncate text-sm"><bdi>{x.name}</bdi></b>
            <span className="text-xs text-muted num">{x.symbol}</span>
          </span>
          {x.available ? (
            <span className="text-end">
              <b className="block num text-sm">{money(x.price, x.currency)}</b>
              <span className={`text-xs num ${tone(x.dayPct ?? 0)}`}>{x.dayPct == null ? "—" : pct(x.dayPct)}</span>
            </span>
          ) : (
            <span className="text-xs text-muted">עוד לא נסחר</span>
          )}
        </Link>
      ))}
    </>
  );
}
