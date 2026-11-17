"use client";

import { useEffect, useState } from "react";
import Keypad from "@/components/keypad";
import SymbolDot from "@/components/symbol-dot";
import SymbolSearch from "@/components/symbol-search";
import { api, dateHe, money } from "@/lib/format";
import { useAdvanced } from "@/lib/use-advanced";
import { NoteCard } from "@/app/p/[id]/mentor-box";
import type { PortfolioView, QuoteForOrder } from "@/lib/engine/service";
import type { Order } from "@/lib/engine/types";

/** תאריכים בהודעות מהשרת (רגילים או מוסתרים) מוצגים בפורמט שלנו */
const withDates = (s: string) => s.replace(/(\d{4}-\d{2}-\d{2}|@\d+)/g, (d) => dateHe(d));
const fmtQty = (n: number) => Number(n.toFixed(6)).toLocaleString("he-IL", { maximumFractionDigits: 6 });

export type TradeIntent = { side: "buy" | "sell"; symbol?: string | null; qty?: number };

type Mode = "amount" | "qty" | "all";

/**
 * חלון קנייה/מכירה (סקיצה 07, D29): נפתח מלמטה בטלפון ובמרכז במחשב.
 * ברירת המחדל: סכום בשקלים, עם שברי מניות והמרה אוטומטית. במצב "מתקדם": לימיט, סטופ ותוקף.
 * המנטור מופיע רק אם יש לו מה להגיד, בשלב "רגע לפני ששולחים".
 */
export default function TradeSheet({ id, intent, view, playing, onClose, onDone }: {
  id: string;
  intent: TradeIntent;
  view: PortfolioView | null;
  playing?: boolean;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const advanced = useAdvanced();
  const [side, setSide] = useState(intent.side);
  const [symbol, setSymbol] = useState(intent.symbol ?? "");
  const [mode, setMode] = useState<Mode>(intent.qty != null ? "qty" : "amount");
  const [value, setValue] = useState(intent.qty != null ? String(intent.qty) : "500");
  const [ccy, setCcy] = useState<"ILS" | "USD">("ILS");
  const [why, setWhy] = useState("");
  const [type, setType] = useState<"market" | "limit" | "stop">("market");
  const [price, setPrice] = useState("");
  const [validity, setValidity] = useState<"day" | "gtc">("day");
  const [q, setQ] = useState<QuoteForOrder | null>(null);
  const [qErr, setQErr] = useState("");
  const [step, setStep] = useState<"form" | "confirm">("form");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const num = Number(value) || 0;
  const sizing = () => (mode === "all" ? { qty: null, sellAll: true } : mode === "amount" ? { qty: null, amount: num, amountCcy: ccy } : { qty: num });
  const orderType = advanced ? type : "market";
  const orderPrice = orderType === "market" || price === "" ? null : Number(price);

  useEffect(() => {
    if (!symbol || (mode !== "all" && !(num > 0))) return;
    const t = setTimeout(async () => {
      try {
        setQ(await api<QuoteForOrder>(`/api/portfolios/${id}/quote`, { method: "POST", json: { ...sizing(), side, symbol, type: orderType, price: orderPrice, why } }));
        setQErr("");
      } catch (e) {
        setQ(null);
        setQErr((e as Error).message);
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, side, symbol, mode, num, ccy, orderType, orderPrice, why]);

  // במחשב: אפשר להקליד ספרות גם בלי ללחוץ על המקלדת שבמסך
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || mode === "all" || step !== "form") return;
      const k = e.key === "Backspace" ? "⌫" : e.key;
      if (/^[0-9.]$/.test(k) || k === "⌫") {
        e.preventDefault();
        setValue((v) => {
          if (k === "⌫") return v.length > 1 ? v.slice(0, -1) : "0";
          if (k === "." ) return v.includes(".") ? v : v + ".";
          return v === "0" ? k : v.length >= 9 ? v : v + k;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, step, onClose]);

  const held = q?.held ?? view?.positions.find((p) => p.symbol === symbol)?.qty ?? 0;
  const amountLabel = mode === "all" ? "כל ההחזקה" : mode === "qty" ? `${value} מניות` : money(num, ccy, num % 1 ? 2 : 0);
  // "הכול": מה שזמין להשקעה, פחות מרווח קטן לעמלות
  const available = view?.totals.availableIls ?? null;
  const cashAll = available ? Math.floor(available * 0.99) : 0;
  const fxRate = q?.fx ?? view?.fx ?? 0;
  const wantIls = mode === "amount" ? (ccy === "USD" ? num * fxRate : num) : (q?.total ?? 0) * (q?.currency === "USD" ? fxRate : 1);
  const over = side === "buy" && available != null && wantIls > available + 0.5;
  const notes = q?.mentor.notes ?? [];
  const block = !q || !!qErr || !!q.minErr || q.shortfall > 0 || why.trim().length < 3 || playing || busy || (orderType !== "market" && !orderPrice);

  async function submit() {
    setBusy(true);
    setErr("");
    try {
      const o = await api<Order>(`/api/portfolios/${id}/orders`, {
        method: "POST",
        json: { ...sizing(), side, symbol, type: orderType, price: orderPrice, validity: advanced ? validity : "day", why, exitPlan: null },
      });
      const what = `${side === "buy" ? "קנייה" : "מכירה"} ${o.fillQty != null ? fmtQty(o.fillQty) + " " : ""}${o.symbol}`;
      onDone(o.status === "filled" ? `✅ ${what} בוצעה במחיר ${money(o.fillPrice, o.currency)}` : o.status === "rejected" ? `⚠️ ${what} נדחתה: ${o.reason}` : `⏳ ${what} נשלחה, ותתבצע ${q?.marketOpen ? "בקרוב" : "בפתיחת המסחר הבאה"}`);
    } catch (e) {
      setErr((e as Error).message);
      setStep("form");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-[rgba(29,22,64,0.35)]" onClick={onClose}>
      <div
        role="dialog"
        aria-label={side === "buy" ? "קנייה" : "מכירה"}
        className="bg-white w-full md:max-w-md rounded-t-[28px] md:rounded-[28px] max-h-[94vh] overflow-y-auto px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1.5 rounded-full bg-line mx-auto md:hidden" />

        {!symbol ? (
          <div className="space-y-3 pb-2">
            <div className="flex items-center"><b className="text-lg flex-1">במה להשקיע?</b><button className="text-muted text-xl" onClick={onClose} aria-label="סגירה">✕</button></div>
            <SymbolSearch placeholder="🔍 חפש מניה או קרן (למשל VOO, Apple)" onPick={(s) => setSymbol(s)} />
            <p className="text-xs text-muted">לא בטוח? בחנות יש אוספים לפי נושא, עם הסבר על כל אחד.</p>
          </div>
        ) : step === "confirm" ? (
          <div className="space-y-3">
            <b className="text-lg block">רגע לפני ששולחים</b>
            {notes.map((n) => <NoteCard key={n.id} n={n} />)}
            <p className="text-xs text-muted">המנטור רק שואל. ההערות נשמרות ביומן ליד העסקה.</p>
            <div className="flex gap-2">
              <button className="btn flex-1" disabled={busy} onClick={submit}>{busy ? "שולח…" : "לשלוח בכל זאת"}</button>
              <button className="btn-ghost flex-1" onClick={() => setStep("form")}>לחשוב שוב</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <SymbolDot symbol={symbol} />
              <div className="min-w-0 flex-1">
                <b className="block truncate">{side === "buy" ? "קנייה" : "מכירה"} · <bdi>{q?.name ?? symbol}</bdi></b>
                <span className="text-xs text-muted num">{q ? `${money(q.refPrice, q.currency)} למניה` : "…"}{held > 0 && ` · מחזיק ${fmtQty(held)}`}</span>
              </div>
              <button className="text-muted text-xl" onClick={onClose} aria-label="סגירה">✕</button>
            </div>

            {held > 0 && (
              <div className="seg">
                <button aria-pressed={side === "buy"} onClick={() => { setSide("buy"); if (mode === "all") setMode("amount"); }}>קנייה</button>
                <button aria-pressed={side === "sell"} onClick={() => setSide("sell")}>מכירה</button>
              </div>
            )}
            <div className="seg">
              <button aria-pressed={mode === "amount"} onClick={() => { setMode("amount"); setValue("500"); }}>לפי סכום</button>
              <button aria-pressed={mode === "qty"} onClick={() => { setMode("qty"); setValue("1"); }}>לפי כמות</button>
              {side === "sell" && <button aria-pressed={mode === "all"} onClick={() => setMode("all")}>מכור הכול</button>}
            </div>

            <div className="text-center">
              <div className="text-4xl font-extrabold num tracking-tight">{amountLabel}</div>
              {mode === "amount" && (
                <div className="seg w-28 mx-auto mt-1.5">
                  <button aria-pressed={ccy === "ILS"} onClick={() => setCcy("ILS")}>₪</button>
                  <button aria-pressed={ccy === "USD"} onClick={() => setCcy("USD")}>$</button>
                </div>
              )}
              {q && mode !== "qty" && <div className="text-[13px] text-muted mt-1">{side === "buy" ? "תקבל" : "תמכור"} בערך <b className="num text-ink">{fmtQty(q.qty)}</b> מניות</div>}
              {side === "buy" && available != null && (
                <div className={`text-[13px] mt-1 ${over ? "text-down font-semibold" : "text-ink-2"}`}>
                  💵 זמין להשקעה: <b className="num">{money(available, "ILS", 0)}</b>{over && " · הסכום גבוה מהזמין"}
                </div>
              )}
              {q && mode === "qty" && <div className="text-[13px] text-muted mt-1">בערך <b className="num text-ink">{money(q.total, q.currency)}</b></div>}
            </div>

            {mode === "amount" && side === "buy" && ccy === "ILS" && (
              <div className="flex gap-1.5 justify-center flex-wrap">
                {[100, 500, 1000].map((a) => (
                  <button key={a} className={`chip text-xs ${num === a ? "chip-on" : ""}`} onClick={() => setValue(String(a))}>{money(a, "ILS", 0)}</button>
                ))}
                {cashAll > 0 && <button className={`chip text-xs ${num === cashAll ? "chip-on" : ""}`} onClick={() => setValue(String(cashAll))}>הכול</button>}
              </div>
            )}

            {q && (
              <div className="text-xs bg-soft rounded-[14px] px-3 py-2 space-y-1">
                {q.fxPlan && (
                  <div className="flex justify-between"><span>המרה לדולרים (אוטומטית)</span><span className="num">{money(q.fxPlan.amount, q.fxPlan.from)} → {money(q.fxPlan.received, q.fxPlan.to)}</span></div>
                )}
                <div className="flex justify-between">
                  <span>עמלה</span>
                  {q.fee === 0 ? (
                    <span className="text-up font-semibold">חינם{q.freeLeft && q.currency === "USD" ? ` · נשארו ${q.freeLeft.actions} פעולות חינם החודש` : ""}</span>
                  ) : (
                    <span className="num">{money(q.fee, q.currency)}</span>
                  )}
                </div>
                <div className={`flex justify-between ${q.marketOpen ? "text-up" : "text-time"}`}><span>{q.marketOpen ? "🟢 המסחר פתוח" : "🌙 תתבצע בפתיחה הבאה"}</span></div>
              </div>
            )}

            {advanced && (
              <div className="rounded-[14px] border border-line p-2.5 space-y-2">
                <b className="text-xs">⚙️ מתקדם</b>
                <div className="seg">
                  {(["market", "limit", "stop"] as const).map((t) => (
                    <button key={t} aria-pressed={type === t} onClick={() => setType(t)}>{t === "market" ? "שוק" : t === "limit" ? "לימיט" : "סטופ"}</button>
                  ))}
                </div>
                {type !== "market" && (
                  <input className="input num" type="number" min={0} step={0.01} placeholder={`מחיר ${type === "limit" ? "לימיט" : "סטופ"}${q ? ` (עכשיו ${q.refPrice.toFixed(2)})` : ""}`} value={price} onChange={(e) => setPrice(e.target.value)} />
                )}
                <select className="input" value={validity} onChange={(e) => setValidity(e.target.value as "day" | "gtc")}>
                  <option value="day">תוקף: עד סוף יום המסחר</option>
                  <option value="gtc">תוקף: עד ביטול (עד 90 יום)</option>
                </select>
              </div>
            )}

            <input className="input text-[13px]" value={why} onChange={(e) => setWhy(e.target.value)} placeholder={side === "buy" ? "✍️ למה? (במשפט אחד, נחזור לזה ביומן)" : "✍️ למה מוכרים? (במשפט אחד)"} />

            {qErr && <div className="text-sm rounded-xl p-2.5 bg-down-soft text-down">{withDates(qErr)}</div>}
            {q?.minErr && <div className="text-sm rounded-xl p-2.5 bg-down-soft text-down">{q.minErr}</div>}
            {q && q.shortfall > 0 && (
              <div className="text-sm rounded-xl p-2.5 bg-warn-soft text-[#6b4100]">
                {side === "buy" ? <>חסרים <b className="num">{money(q.shortfall, q.fxShortCcy ?? q.currency)}</b> בקופה.</> : <>יש לך רק {fmtQty(q.available)} מניות פנויות.</>}
              </div>
            )}
            {err && <div className="text-sm rounded-xl p-2.5 bg-down-soft text-down">{withDates(err)}</div>}

            {mode !== "all" && <Keypad value={value} onChange={setValue} maxDecimals={mode === "qty" ? 6 : 2} />}

            <button className={side === "buy" ? "btn w-full !py-3" : "btn w-full !py-3 !bg-down"} disabled={block} onClick={() => (notes.length ? setStep("confirm") : submit())}>
              {busy ? "שולח…" : side === "buy" ? `להשקיע ${amountLabel}` : `למכור ${amountLabel}`}
            </button>
            {playing && <p className="text-xs text-time text-center">⏸ עצור את מכונת הזמן כדי לשלוח פקודה.</p>}
            {!playing && q && why.trim().length < 3 && <p className="text-xs text-muted text-center">כדי לשלוח, כתוב במשפט אחד למה.</p>}
            {q && mode !== "qty" && q.refPrice > 0 && (
              <p className="text-[11px] text-muted text-center">הכמות הסופית נקבעת בביצוע, לפי המחיר בפועל.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
