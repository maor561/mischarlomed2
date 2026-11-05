"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Term from "@/components/term";
import InstrumentChart from "@/components/instrument-chart";
import { api, dateHe, money, pct, signed, tone } from "@/lib/format";
import type { StockPage } from "@/lib/stock";

const KIND_HE: Record<string, string> = { EQUITY: "מניה", ETF: "קרן סל", INDEX: "מדד" };

function bigMoney(n: number | null, ccy: string): string {
  if (n == null) return "—";
  const s = ccy === "USD" ? "$" : "₪";
  if (n >= 1e12) return `${s}${(n / 1e12).toFixed(2)} טריליון`;
  if (n >= 1e9) return `${s}${(n / 1e9).toFixed(1)} מיליארד`;
  if (n >= 1e6) return `${s}${(n / 1e6).toFixed(0)} מיליון`;
  return money(n, ccy, 0);
}

export default function StockScreen() {
  const { id, symbol: raw } = useParams<{ id: string; symbol: string }>();
  const symbol = decodeURIComponent(raw);
  const [s, setS] = useState<StockPage | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    api<StockPage>(`/api/portfolios/${id}/stock/${encodeURIComponent(symbol)}`).then(
      (x) => alive && setS(x),
      (e) => alive && setErr((e as Error).message),
    );
    return () => {
      alive = false;
    };
  }, [id, symbol]);

  const back = <Link href={`/p/${id}`} className="text-sm text-brand">→ חזרה לתיק</Link>;
  if (err) return <main className="max-w-6xl mx-auto p-4 md:p-6 space-y-3">{back}<div className="card bg-down-soft text-down">{err.replace(/(\d{4}-\d{2}-\d{2}|@\d+)/g, (d) => dateHe(d))}</div></main>;
  if (!s) return <main className="max-w-6xl mx-auto p-4 md:p-6">{back}<div className="card text-muted mt-3">טוען…</div></main>;

  const f = s.fundamentals;
  const tradeHref = (side: "buy" | "sell") => `/p/${id}?tab=order&side=${side}&symbol=${encodeURIComponent(s.symbol)}${side === "sell" && s.holding ? `&qty=${s.holding.qty}` : ""}`;

  return (
    <main className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
      {back}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="card space-y-3 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h1 className="text-xl font-bold">{s.name}</h1>
            <span className="num text-muted">{s.symbol}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-brand-soft text-brand">
              {KIND_HE[s.kind] ?? s.kind} · {s.exchange} · {s.currency === "USD" ? "דולר" : "שקל"}
            </span>
            {s.sector && <span className="text-xs px-2 py-0.5 rounded-full bg-bg text-muted">{s.sector}</span>}
            <span className="flex-1" />
            <span className="text-2xl font-bold num">{money(s.price, s.currency)}</span>
            {s.dayPct != null && <span className={`num ${tone(s.dayPct)}`}>{pct(s.dayPct)} היום</span>}
          </div>
          <div className="text-xs text-muted">{s.live ? "מחיר אחרון (באיחור של כ-15 דקות)" : `מחיר הסגירה ב-${dateHe(s.asOf)}`}</div>
          <InstrumentChart id={id} symbol={s.symbol} version={s.asOf} height={220} />

          <h2 className="font-semibold pt-2">נתוני חברה</h2>
          {s.kind !== "EQUITY" ? (
            <p className="text-sm text-muted">ל<Term id="etf">קרן סל</Term> אין נתוני חברה אחת: היא מחזיקה הרבה חברות.</p>
          ) : !s.live ? (
            <div className="text-sm rounded-lg p-2.5 bg-time-soft text-time">
              ⏳ נתוני חברה זמינים רק בתיק חי. אין לנו את הערכים כפי שהיו ב-{dateHe(s.asOf)}, ומספרים של היום היו מטעים.
            </div>
          ) : !f ? (
            <p className="text-sm text-muted">נתוני החברה לא זמינים כרגע מהספק.</p>
          ) : null}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {s.live && f && (
              <>
                <Fact label={<Term id="marketcap">שווי שוק</Term>} v={bigMoney(f.marketCap, s.currency)} />
                <Fact label={<Term id="pe">מכפיל רווח (P/E)</Term>} v={f.trailingPE ? f.trailingPE.toFixed(1) : "— (אין רווח)"} />
                <Fact label={<Term id="forward-pe">מכפיל רווח צפוי</Term>} v={f.forwardPE ? f.forwardPE.toFixed(1) : "—"} />
                <Fact label={<Term id="div-yield">תשואת דיבידנד</Term>} v={f.dividendYield != null ? `${f.dividendYield.toFixed(2)}%` : "—"} />
                <Fact label={<Term id="beta">בטא</Term>} v={f.beta != null ? f.beta.toFixed(2) : "—"} />
                {f.industry && <Fact label="ענף" v={f.industry} />}
              </>
            )}
            <Fact label="שיא / שפל בשנה האחרונה" v={s.high52 != null ? `${money(s.low52, s.currency)} – ${money(s.high52, s.currency)}` : "—"} />
          </div>
        </div>

        <div className="space-y-4">
          <div className="card">
            <h2 className="font-semibold mb-2">ההחזקה שלך</h2>
            {s.holding ? (
              <div className="text-sm space-y-1">
                <Row k="כמות" v={String(s.holding.qty)} />
                <Row k="קנייה ממוצעת" v={money(s.holding.avgCost, s.currency)} />
                <Row k="שווי" v={money(s.holding.valueIls, "ILS", 0)} />
                <Row k={<Term id="pnl">רווח/הפסד</Term>} v={`${signed(s.holding.pnlIls, "ILS", 0)} (${pct(s.holding.pnlPct)})`} cls={tone(s.holding.pnlIls)} />
              </div>
            ) : (
              <p className="text-sm text-muted">אין לך את הנייר הזה.</p>
            )}
            <div className="flex gap-2 mt-3">
              <Link href={tradeHref("buy")} className="flex-1 text-center py-2.5 rounded-lg bg-up text-white font-semibold">קנייה</Link>
              {s.holding && <Link href={tradeHref("sell")} className="flex-1 text-center py-2.5 rounded-lg bg-down text-white font-semibold">מכירה</Link>}
            </div>
          </div>

          {s.history.length > 0 && (
            <div className="card">
              <h2 className="font-semibold mb-2">ההיסטוריה שלך עם הנייר</h2>
              <div className="space-y-2 text-sm">
                {s.history.map((h, i) => (
                  <div key={i} className="border-b border-line last:border-0 pb-1.5">
                    <span className="num text-muted text-xs">{dateHe(h.d)}</span>{" "}
                    {h.kind === "buy" ? `קנייה ${h.qty} × ${money(h.price, s.currency)}` : h.kind === "sell" ? `מכירה ${-h.qty} × ${money(h.price, s.currency)}` : h.kind === "dividend" ? `דיבידנד ${money(h.price, s.currency, 4)} למניה` : `פיצול ${String(h.meta.before)} → ${String(h.meta.after)}`}
                    {h.why && <div className="text-xs text-muted">&quot;{h.why}&quot;</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card">
            <h2 className="font-semibold mb-1"><Term id="dividend">דיבידנדים</Term> בשנה האחרונה</h2>
            {s.dividends.length === 0 ? (
              <p className="text-sm text-muted">לא חולקו דיבידנדים בשנה האחרונה.</p>
            ) : (
              <p className="text-sm">
                {s.dividends.length} תשלומים. האחרון: <b className="num">{money(s.dividends.at(-1)!.amount, s.currency, 4)}</b> למניה, ב-<span className="num">{dateHe(s.dividends.at(-1)!.d)}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function Fact({ label, v }: { label: React.ReactNode; v: string }) {
  return (
    <div className="bg-bg rounded-lg px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <b className="num text-[15px]">{v}</b>
    </div>
  );
}

function Row({ k, v, cls = "" }: { k: React.ReactNode; v: string; cls?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{k}</span>
      <span className={`num ${cls}`}>{v}</span>
    </div>
  );
}
