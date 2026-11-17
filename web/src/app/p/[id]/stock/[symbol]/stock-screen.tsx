"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Term from "@/components/term";
import InstrumentChart from "@/components/instrument-chart";
import SymbolDot from "@/components/symbol-dot";
import TradeSheet, { type TradeIntent } from "@/components/trade-sheet";
import PlanSheet from "@/components/plan-sheet";
import { api, dateHe, money, pct, signed, tone } from "@/lib/format";
import type { StockPage } from "@/lib/stock";
import type { PortfolioView } from "@/lib/engine/service";

const KIND_HE: Record<string, string> = { EQUITY: "מניה", ETF: "קרן סל", INDEX: "מדד" };

function bigMoney(n: number | null, ccy: string): string {
  if (n == null) return "—";
  const s = ccy === "USD" ? "$" : "₪";
  if (n >= 1e12) return `${s}${(n / 1e12).toFixed(2)} טריליון`;
  if (n >= 1e9) return `${s}${(n / 1e9).toFixed(1)} מיליארד`;
  if (n >= 1e6) return `${s}${(n / 1e6).toFixed(0)} מיליון`;
  return money(n, ccy, 0);
}

/**
 * דף נייר (סקיצה 07): מחיר גדול, גרף, "ההחזקה שלך", ☆ למעקב,
 * וכפתורי "להשקיע" / "למכור" קבועים בתחתית. במכונת זמן הכול נחתך ביום הסימולציה.
 */
export default function StockScreen() {
  const { id, symbol: raw } = useParams<{ id: string; symbol: string }>();
  const symbol = decodeURIComponent(raw);
  const [s, setS] = useState<StockPage | null>(null);
  const [v, setV] = useState<PortfolioView | null>(null);
  const [err, setErr] = useState("");
  const [trade, setTrade] = useState<TradeIntent | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [flash, setFlash] = useState("");
  const [watched, setWatched] = useState(false);
  const [n, setN] = useState(0);

  const reload = useCallback(() => setN((x) => x + 1), []);
  useEffect(() => {
    let alive = true;
    api<StockPage>(`/api/portfolios/${id}/stock/${encodeURIComponent(symbol)}`).then(
      (x) => {
        if (!alive) return;
        setS(x);
        setWatched(x.watched);
      },
      (e) => alive && setErr((e as Error).message),
    );
    api<PortfolioView>(`/api/portfolios/${id}`).then((x) => alive && setV(x), () => {});
    return () => {
      alive = false;
    };
  }, [id, symbol, n]);

  async function toggleWatch() {
    const on = !watched;
    setWatched(on);
    try {
      await api(`/api/portfolios/${id}/watch`, { method: "POST", json: { symbol, on } });
    } catch {
      setWatched(!on);
    }
  }

  const back = <Link href={`/p/${id}`} className="text-xl text-muted" aria-label="חזרה לתיק">→</Link>;
  if (err) return <main className="max-w-5xl mx-auto p-4 md:p-6 space-y-3">{back}<div className="card bg-down-soft text-down">{err.replace(/(\d{4}-\d{2}-\d{2}|@\d+)/g, (d) => dateHe(d))}</div></main>;
  if (!s) return <main className="max-w-5xl mx-auto p-4 md:p-6">{back}<div className="card text-muted mt-3">טוען…</div></main>;

  const f = s.fundamentals;
  const isTime = s.mode === "time";

  return (
    <main className="max-w-5xl mx-auto p-4 md:p-6 pb-32 md:pb-8 space-y-4">
      <div className="flex items-center gap-2.5">
        {back}
        <SymbolDot symbol={s.symbol} size={42} />
        <div className="min-w-0 flex-1">
          <h1 className="font-extrabold text-lg leading-tight truncate"><bdi>{s.name}</bdi></h1>
          <span className="text-xs text-muted"><span className="num">{s.symbol}</span> · {KIND_HE[s.kind] ?? s.kind}{s.sector ? ` · ${s.sector}` : ""} · {s.exchange}</span>
        </div>
        <button className={`text-2xl ${watched ? "text-sun" : "text-muted"}`} onClick={toggleWatch} aria-pressed={watched} title={watched ? "הסר מרשימת המעקב" : "הוסף לרשימת המעקב"}>
          {watched ? "★" : "☆"}
        </button>
      </div>

      {flash && (
        <div className="rounded-2xl px-4 py-2.5 text-sm bg-plum-soft text-ink flex gap-2">
          <span className="flex-1">{flash}</span>
          <Link href={`/p/${id}`} className="underline">לתיק</Link>
          <button onClick={() => setFlash("")} aria-label="סגירה">✕</button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr] items-start">
        <div className="space-y-4 min-w-0">
          <div className="card space-y-2">
            <div className="text-4xl font-extrabold num tracking-tight">{money(s.price, s.currency)}</div>
            <div className="flex items-center gap-2 flex-wrap">
              {s.dayPct != null && (
                <span className={`pill ${s.dayPct >= 0 ? "bg-up-soft text-up" : "bg-down-soft text-down"}`}>
                  {s.dayPct >= 0 ? "▲" : "▼"} <span className="num">{pct(s.dayPct)}</span> היום
                </span>
              )}
              <span className="text-xs text-muted">{s.live ? "מחיר אחרון (באיחור של כ-15 דקות)" : `סגירה ב-${dateHe(s.asOf)}`}</span>
            </div>
            <InstrumentChart id={id} symbol={s.symbol} version={s.asOf} height={220} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <Fact label="שיא / שפל בשנה" v={s.high52 != null ? `${money(s.low52, s.currency)} – ${money(s.high52, s.currency)}` : "—"} />
            {s.live && f && (
              <>
                <Fact label={<Term id="marketcap">שווי שוק</Term>} v={bigMoney(f.marketCap, s.currency)} />
                <Fact label={<Term id="pe">מכפיל רווח</Term>} v={f.trailingPE ? f.trailingPE.toFixed(1) : "— (אין רווח)"} />
                <Fact label={<Term id="forward-pe">מכפיל צפוי</Term>} v={f.forwardPE ? f.forwardPE.toFixed(1) : "—"} />
                <Fact label={<Term id="div-yield">תשואת דיבידנד</Term>} v={f.dividendYield != null ? `${f.dividendYield.toFixed(2)}%` : "—"} />
                <Fact label={<Term id="beta">בטא</Term>} v={f.beta != null ? f.beta.toFixed(2) : "—"} />
              </>
            )}
          </div>
          {s.kind !== "EQUITY" ? (
            <p className="text-sm text-muted">ל<Term id="etf">קרן סל</Term> אין נתוני חברה אחת: היא מחזיקה הרבה חברות.</p>
          ) : !s.live ? (
            <div className="text-sm rounded-2xl p-3 bg-time-soft text-ink-2">⏳ נתוני חברה זמינים רק בתיק חי. אין לנו את הערכים כפי שהיו ב-{dateHe(s.asOf)}, ומספרים של היום היו מטעים.</div>
          ) : !f ? (
            <p className="text-sm text-muted">נתוני החברה לא זמינים כרגע מהספק.</p>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="card">
            <b>ההחזקה שלך</b>
            {s.holding ? (
              <div className="text-sm space-y-1 mt-2">
                <Row k="שווי" v={money(s.holding.valueIls, "ILS", 0)} bold />
                <Row k="כמות" v={String(Number(s.holding.qty.toFixed(6)))} />
                <Row k="קנייה ממוצעת" v={money(s.holding.avgCost, s.currency)} />
                <Row k={<Term id="pnl">רווח/הפסד</Term>} v={`${signed(s.holding.pnlIls, "ILS", 0)} (${pct(s.holding.pnlPct)})`} cls={tone(s.holding.pnlIls)} />
              </div>
            ) : (
              <p className="text-sm text-muted mt-1">אין לך את הנייר הזה עדיין.</p>
            )}
            {/* מחשב: הכפתורים כאן. טלפון: בפס הקבוע בתחתית */}
            <div className="hidden md:flex gap-2 mt-3">
              <button className="btn-sun flex-[2]" onClick={() => setTrade({ side: "buy", symbol: s.symbol })}>להשקיע</button>
              {s.holding && <button className="btn-ghost flex-1" onClick={() => setTrade({ side: "sell", symbol: s.symbol })}>למכור</button>}
            </div>
            <button className="hidden md:block w-full mt-2 text-sm font-semibold text-[#0c7a66] bg-mint-soft rounded-full py-2" onClick={() => setPlanOpen(true)}>🔁 השקעה קבועה ב-{s.symbol}</button>
          </div>

          {s.history.length > 0 && (
            <div className="card">
              <b>ההיסטוריה שלך עם הנייר</b>
              <div className="space-y-2 text-sm mt-2">
                {s.history.map((h, i) => (
                  <div key={i} className="border-b border-line last:border-0 pb-1.5">
                    <span className="num text-muted text-xs">{dateHe(h.d)}</span>{" "}
                    {h.kind === "buy" ? `קנייה ${Number(h.qty.toFixed(6))} × ${money(h.price, s.currency)}` : h.kind === "sell" ? `מכירה ${Number((-h.qty).toFixed(6))} × ${money(h.price, s.currency)}` : h.kind === "dividend" ? `דיבידנד ${money(h.price, s.currency, 4)} למניה` : `פיצול ${String(h.meta.before)} → ${String(h.meta.after)}`}
                    {h.why && <div className="text-xs text-muted">&quot;{h.why}&quot;</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <b><Term id="dividend">דיבידנדים</Term> בשנה האחרונה</b>
            {s.dividends.length === 0 ? (
              <p className="text-sm text-muted mt-1">לא חולקו דיבידנדים בשנה האחרונה.</p>
            ) : (
              <p className="text-sm mt-1">
                {s.dividends.length} תשלומים. האחרון: <b className="num">{money(s.dividends.at(-1)!.amount, s.currency, 4)}</b> למניה, ב-<span className="num">{dateHe(s.dividends.at(-1)!.d)}</span>
              </p>
            )}
          </div>
          {isTime && <p className="text-xs text-muted px-1">⏳ מכונת זמן: הגרף והנתונים נעצרים ב-{dateHe(s.asOf)}.</p>}
        </div>
      </div>

      {/* טלפון: פעולות קבועות בתחתית */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-line px-4 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex gap-2">
        <button className="btn-sun flex-[2] !py-3" onClick={() => setTrade({ side: "buy", symbol: s.symbol })}>להשקיע</button>
        {s.holding && <button className="btn-ghost flex-1 !py-3" onClick={() => setTrade({ side: "sell", symbol: s.symbol })}>למכור</button>}
        <button className="rounded-full bg-mint-soft text-[#0c7a66] px-4 font-bold" onClick={() => setPlanOpen(true)} aria-label="השקעה קבועה">🔁</button>
      </div>

      {trade && (
        <TradeSheet
          id={id}
          intent={trade}
          view={v}
          onClose={() => setTrade(null)}
          onDone={(msg) => {
            setTrade(null);
            setFlash(msg);
            reload();
          }}
        />
      )}
      {planOpen && (
        <PlanSheet
          id={id}
          symbol={s.symbol}
          name={s.name}
          onClose={() => setPlanOpen(false)}
          onDone={(msg) => {
            setPlanOpen(false);
            setFlash(msg);
          }}
        />
      )}
    </main>
  );
}

function Fact({ label, v }: { label: React.ReactNode; v: string }) {
  return (
    <div className="card !px-3 !py-2.5">
      <div className="text-[11px] text-muted">{label}</div>
      <b className="num text-[15px]">{v}</b>
    </div>
  );
}

function Row({ k, v, cls = "", bold }: { k: React.ReactNode; v: string; cls?: string; bold?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{k}</span>
      <span className={`num ${cls} ${bold ? "font-bold" : ""}`}>{v}</span>
    </div>
  );
}
