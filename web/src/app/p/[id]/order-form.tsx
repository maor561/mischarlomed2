"use client";

import Term from "@/components/term";
import { useEffect, useState } from "react";
import SymbolSearch from "@/components/symbol-search";
import { api, dateHe, money } from "@/lib/format";

/** תאריכים בתוך הודעות מהשרת (רגילים או מוסתרים) מוצגים בפורמט שלנו */
const withDates = (s: string) => s.replace(/(\d{4}-\d{2}-\d{2}|@\d+)/g, (d) => dateHe(d));
import type { PortfolioView, QuoteForOrder } from "@/lib/engine/service";
import type { Order } from "@/lib/engine/types";
import InstrumentChart from "@/components/instrument-chart";
import MentorBox from "./mentor-box";

export type OrderPrefill = { side: "buy" | "sell"; symbol: string; qty: number };

const TYPES = [
  { k: "market", label: "שוק", buy: "בכל מחיר, בהקדם האפשרי", sell: "בכל מחיר, בהקדם האפשרי" },
  { k: "limit", label: "לימיט", buy: "רק אם המחיר ירד למחיר שקבעתי או נמוך ממנו", sell: "רק אם המחיר עלה למחיר שקבעתי או גבוה ממנו" },
  { k: "stop", label: "סטופ", buy: "כשהמחיר עולה לרמה, קונים במחיר שוק", sell: "סטופ-לוס: כשהמחיר יורד לרמה, מוכרים במחיר שוק" },
] as const;

export default function OrderForm({ id, view, prefill, onDone, onNeedCash, playing = false }: {
  id: string;
  view: PortfolioView;
  prefill: OrderPrefill | null;
  onDone: (msg: string) => void;
  onNeedCash: (ils: number) => void;
  playing?: boolean;
}) {
  const [side, setSide] = useState<"buy" | "sell">(prefill?.side ?? "buy");
  const [symbol, setSymbol] = useState(prefill?.symbol ?? "");
  const [qty, setQty] = useState(prefill?.qty ?? 1);
  const [type, setType] = useState<"market" | "limit" | "stop">("market");
  const [price, setPrice] = useState<number | "">("");
  const [validity, setValidity] = useState<"day" | "gtc">("day");
  const [why, setWhy] = useState("");
  const [exitPlan, setExitPlan] = useState("");
  const [q, setQ] = useState<QuoteForOrder | null>(null);
  const [qErr, setQErr] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    const t = setTimeout(async () => {
      try {
        setQ(await api<QuoteForOrder>(`/api/portfolios/${id}/quote`, { method: "POST", json: { side, symbol, qty, type, price: price === "" ? null : price, why, exitPlan } }));
        setQErr("");
      } catch (e) {
        setQ(null);
        setQErr((e as Error).message);
      }
    }, 350);
    return () => clearTimeout(t);
    // מחשבים מחדש גם כשהקופה משתנה (למשל אחרי המרה)
  }, [id, side, symbol, qty, type, price, why, exitPlan, view.cash.ILS, view.cash.USD, view.pending.length]);

  async function submit() {
    setBusy(true);
    setErr("");
    try {
      const o = await api<Order>(`/api/portfolios/${id}/orders`, {
        method: "POST",
        json: { side, symbol, qty, type, price: type === "market" ? null : price === "" ? null : price, validity, why, exitPlan: exitPlan || null },
      });
      const what = `${side === "buy" ? "קנייה" : "מכירה"} ${o.qty} ${o.symbol}`;
      onDone(o.status === "filled" ? `✅ ${what} בוצעה במחיר ${money(o.fillPrice, o.currency)}` : o.status === "rejected" ? `⚠️ ${what} נדחתה: ${o.reason}` : `⏳ ${what} נשלחה וממתינה לביצוע`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ccy = q?.currency ?? "USD";
  const isTime = view.portfolio.mode === "time";
  const shortIls = q && side === "buy" && q.shortfall > 0 ? Math.ceil((ccy === "USD" ? q.shortfall * q.fx * 1.01 : q.shortfall) / 10) * 10 : 0;

  return (
    <div className="grid gap-4 md:grid-cols-[3fr_2fr]">
      <div className="card space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <button className={`py-2.5 rounded-lg border font-semibold ${side === "buy" ? "bg-up text-white border-up" : "bg-white border-line"}`} onClick={() => setSide("buy")}>קנייה</button>
          <button className={`py-2.5 rounded-lg border font-semibold ${side === "sell" ? "bg-down text-white border-down" : "bg-white border-line"}`} onClick={() => setSide("sell")}>מכירה</button>
        </div>
        <div>
          <span className="text-xs text-muted">נייר</span>
          {side === "sell" && view.positions.length > 0 ? (
            <div className="flex gap-1.5 flex-wrap mt-1">
              {view.positions.map((p) => (
                <button key={p.symbol} className={`chip num ${symbol === p.symbol ? "chip-on" : ""}`} onClick={() => { setSymbol(p.symbol); setQty(p.qty); }}>
                  {p.symbol} ({p.qty})
                </button>
              ))}
            </div>
          ) : side === "sell" ? (
            <p className="text-sm text-muted mt-1">אין מניות בתיק למכירה. אין שורט בגרסה הזאת.</p>
          ) : (
            <div className="mt-1"><SymbolSearch value={symbol} onPick={(s) => setSymbol(s)} /></div>
          )}
        </div>
        {q && (
          <div className="flex items-baseline gap-2 flex-wrap">
            <b className="text-lg num">{q.symbol}</b>
            <span className="text-muted">{q.name}</span>
            <span className="flex-1" />
            <span className="text-2xl font-bold num">{money(q.refPrice, ccy)}</span>
            <span className="text-xs text-muted w-full">
              {isTime ? `מחיר הסגירה ב-${dateHe(q.simDate)}` : "מחיר אחרון"} · מחזיק {q.held} מניות
            </span>
          </div>
        )}
        {symbol && <InstrumentChart id={id} symbol={symbol} version={view.portfolio.simDate} />}
        {q && <div className={`text-sm rounded-lg p-2.5 ${q.marketOpen ? "bg-up-soft text-up" : "bg-time-soft text-time"}`}>{q.marketOpen ? "🟢 " : "🌙 "}{withDates(q.note)}</div>}
        {qErr && <div className="text-sm rounded-lg p-2.5 bg-down-soft text-down">{withDates(qErr)}</div>}

        <div>
          <span className="text-xs text-muted">סוג פקודה · <Term id="market-order">שוק</Term> · <Term id="limit">לימיט</Term> · <Term id="stop">סטופ</Term></span>
          <div className="grid grid-cols-3 gap-2 mt-1">
            {TYPES.map((t) => (
              <button key={t.k} onClick={() => setType(t.k)} className={`text-start rounded-lg border px-3 py-2 ${type === t.k ? "border-brand bg-brand-soft" : "border-line bg-white"}`}>
                <b className="block text-sm">{t.label}</b>
                <small className="text-muted text-xs">{side === "buy" ? t.buy : t.sell}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs text-muted">כמות (מניות שלמות)</span>
            <input className="input num mt-1" type="number" min={1} step={1} value={qty} onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))} />
          </label>
          {type !== "market" ? (
            <label className="block">
              <span className="text-xs text-muted">{type === "limit" ? "מחיר לימיט" : "מחיר סטופ"} ({ccy === "USD" ? "$" : "₪"})</span>
              <input className="input num mt-1" type="number" min={0} step={0.01} value={price} placeholder={q ? q.refPrice.toFixed(2) : ""} onChange={(e) => setPrice(e.target.value === "" ? "" : Number(e.target.value))} />
            </label>
          ) : <div />}
        </div>
        <label className="block">
          <span className="text-xs text-muted"><Term id="validity">תוקף</Term></span>
          <select className="input mt-1" value={validity} onChange={(e) => setValidity(e.target.value as "day" | "gtc")}>
            <option value="day">עד סוף יום המסחר</option>
            <option value="gtc">עד ביטול (עד 90 יום)</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-muted">✍️ למה? (חובה. נחזור לזה ביומן)</span>
          <textarea className="input mt-1" rows={2} value={why} onChange={(e) => setWhy(e.target.value)} placeholder={side === "buy" ? "למשל: רוצה בסיס רחב של כל השוק לטווח ארוך" : "למשל: הגעתי ליעד שקבעתי מראש"} />
        </label>
        <label className="block">
          <span className="text-xs text-muted">{side === "buy" ? "מתי תמכור? (אופציונלי)" : "מה תעשה עם הכסף? (אופציונלי)"}</span>
          <input className="input mt-1" value={exitPlan} onChange={(e) => setExitPlan(e.target.value)} placeholder={side === "buy" ? "למשל: אם תרד עוד 15%, או בעוד שנה" : ""} />
        </label>
      </div>

      <div className="card space-y-2 self-start">
        <h3 className="font-semibold">הערכת עלות</h3>
        {!q ? (
          <p className="text-sm text-muted">בחר נייר כדי לראות הערכה.</p>
        ) : (
          <>
            <Row k={`${qty} × ${money(type === "market" || price === "" ? q.refPrice : Number(price), ccy)}`} v={money(q.gross, ccy)} />
            <Row k="עמלה" v={money(q.fee, ccy)} />
            <Row k={side === "buy" ? "ירד מהקופה (הערכה)" : "ייכנס לקופה לפני מס (הערכה)"} v={money(q.total, ccy)} bold />
            {ccy === "USD" && <Row k="בשקלים" v={money(q.total * q.fx, "ILS")} />}
            {side === "buy" && (
              <p className="text-xs text-muted">
                {type === "limit" ? "בלימיט נשמר בקופה הסכום המלא לפי מחיר הלימיט." : <>נשמר בקופה עד הביצוע: <b className="num">{money(q.reserve, ccy)}</b> (הערכה ועוד <span className="num">10%</span>, למקרה שהמחיר יקפוץ).</>}{" "}
                פנוי בקופה: <span className="num">{money(q.available, ccy)}</span>
              </p>
            )}
            {side === "sell" && <p className="text-xs text-muted">מניות פנויות למכירה: {q.available}. מס רווחי הון (25% מהרווח בשקלים) ינוכה בזמן המכירה.</p>}
            {q.shortfall > 0 && (
              <div className="text-sm rounded-lg p-2.5 bg-warn-soft text-[#6b4100]">
                {side === "buy" ? (
                  <>
                    חסרים <b className="num">{money(q.shortfall, ccy)}</b> בקופת ה{ccy === "USD" ? "דולרים" : "שקלים"}.
                    {ccy === "USD" && (
                      <button className="block underline font-semibold mt-1" onClick={() => onNeedCash(shortIls)}>
                        המר <span className="num">{money(shortIls, "ILS", 0)}</span> לדולרים ←
                      </button>
                    )}
                  </>
                ) : (
                  <>יש לך רק {q.available} מניות פנויות.</>
                )}
              </div>
            )}
          </>
        )}
        {q && <MentorBox mentor={q.mentor} hasWhy={why.trim().length >= 3} />}
        {err && <div className="text-sm rounded-lg p-2.5 bg-down-soft text-down">{err}</div>}
        <button className="btn w-full" disabled={busy || playing || !q || q.shortfall > 0 || why.trim().length < 3} onClick={submit}>
          {busy ? "שולח…" : "שלח פקודה"}
        </button>
        {playing && <p className="text-xs text-time">⏸ עצור את הנגן כדי לשלוח פקודה.</p>}
        {why.trim().length < 3 && q && <p className="text-xs text-muted">כדי לשלוח צריך לכתוב למה.</p>}
      </div>
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${bold ? "font-bold border-t border-line pt-2" : ""}`}>
      <span className="num">{k}</span>
      <span className="num">{v}</span>
    </div>
  );
}
